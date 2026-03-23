import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { parseMobileScreens } from "@/lib/mobile/parseMobileVersionHtml";
import { exportImageDesign } from "@/lib/export/imageExporter";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";

import type { ExportFormat } from "@prisma/client";

const bodySchema = z.object({
  designId: z.string().cuid(),
  versionNumber: z.number().int().min(1).optional(),
  format: z.enum(["png", "jpg"]),
  quality: z.number().int().min(80).max(100).optional(),
  exportSectionsIndividually: z.boolean().optional(),
});

function imageMime(format: "png" | "jpg") {
  return format === "jpg" ? "image/jpeg" : "image/png";
}

function estimatedSecondsForImage(slideCount: number) {
  // Heuristic: each slide costs ~1.2s + overhead.
  return slideCount * 1.2 + 1.0;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getRequiredSession().catch(() => null);
  if (!session) return fail("UNAUTHORIZED", "Authentication required", 401);

  const userId = session.user.id;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const { designId, versionNumber, format, quality, exportSectionsIndividually } = parsed.data;

  const limitsKeyHour = `export:image:hour:${userId}`;
  const limitsKeyDay = `export:image:day:${userId}`;

  const [hourRl, dayRl] = await Promise.all([
    checkRateLimit(limitsKeyHour, { windowSeconds: 60 * 60, maxRequests: 20 }),
    checkRateLimit(limitsKeyDay, { windowSeconds: 60 * 60 * 24, maxRequests: 100 }),
  ]);

  const retryAfter = Math.max(hourRl.retryAfterSeconds ?? 0, dayRl.retryAfterSeconds ?? 0);
  if (!hourRl.allowed || !dayRl.allowed) {
    const reset = new Date(Date.now() + (retryAfter || 60) * 1000).toISOString();
    const limit = !hourRl.allowed ? hourRl.limit : dayRl.limit;
    const unit = !hourRl.allowed ? "hour" : "day";
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Export limit reached. You can export ${limit} designs per ${unit}. Try again at ${reset}.`,
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter || 60),
        },
      }
    );
  }

  // Ownership verification + load version.
  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    select: { id: true, currentVersion: true, platform: true },
  });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const targetVersion = versionNumber ?? design.currentVersion;

  const version = await prisma.designVersion.findUnique({
    where: { designId_versionNumber: { designId, versionNumber: targetVersion } },
  });
  if (!version) return fail("NOT_FOUND", "Design version not found", 404);

  const mobileScreens = parseMobileScreens(version.htmlContent);
  const slideCount =
    mobileScreens && mobileScreens.length > 0
      ? mobileScreens.length
      : (() => {
          const parsedSlides = parseSlidesFromHtml(version.htmlContent);
          return parsedSlides.type === "single" ? 1 : Math.max(parsedSlides.slides.length, 2);
        })();

  const expectedFormat = format as unknown as ExportFormat;
  const basePath = `exports/${designId}/${targetVersion}`;

  if (exportSectionsIndividually && (design.platform === "website" || design.platform === "dashboard")) {
    const out = await exportImageDesign({
      designId,
      versionNumber: targetVersion,
      format,
      quality: quality ?? 90,
      exportSectionsIndividually: true,
    });

    // User-initiated exports count as implicit approvals for learning signals.
    await prisma.generationLog.updateMany({ where: { designId }, data: { wasApproved: true } });

    return ok({
      fileUrls: out.fileUrls,
      zipUrl: out.zipUrl,
      exportId: out.exportIds[out.exportIds.length - 1],
      fileSizeBytes: out.fileSizeBytes,
    });
  }

  // Cache check: if we already have all slide exports and ZIP, return them.
  const allExisting = await prisma.export.findMany({
    where: { designId, versionNumber: targetVersion, format: expectedFormat },
    select: { id: true, fileUrl: true, fileSizeBytes: true, createdAt: true },
  });
  const zipExisting = await prisma.export.findFirst({
    where: { designId, versionNumber: targetVersion, format: "zip" as any },
    select: { id: true, fileUrl: true, fileSizeBytes: true },
  });

  const expectedUrls =
    slideCount <= 1
      ? [`/api/files/${basePath}/design.${format}`]
      : Array.from({ length: slideCount }, (_, i) => `/api/files/${basePath}/slide_${String(i + 1).padStart(2, "0")}.${format === "jpg" ? "jpg" : "png"}`);

  const existingUrlSet = new Set(allExisting.map((e) => e.fileUrl));
  const hasAllSlides = expectedUrls.every((u) => existingUrlSet.has(u));

  if (hasAllSlides && (slideCount <= 1 || zipExisting)) {
    const zipUrl = zipExisting?.fileUrl;
    const fileUrls = expectedUrls;
    const totalSize = allExisting
      .filter((e) => expectedUrls.includes(e.fileUrl))
      .reduce((acc, e) => acc + (e.fileSizeBytes ?? 0), 0);

    return ok({
      fileUrls,
      zipUrl,
      exportId: zipExisting?.id ?? allExisting[0]?.id,
      fileSizeBytes: slideCount > 1 && zipExisting ? (zipExisting.fileSizeBytes ?? totalSize) : totalSize,
    });
  }

  const estimateSeconds = estimatedSecondsForImage(slideCount);
  if (estimateSeconds > 5) {
    // Async: enqueue job and return immediately.
    const jobFormat = format === "jpg" ? `jpg|q=${quality ?? 90}` : "png";
    const { jobId } = await enqueueExportJob({ designId, versionNumber: targetVersion, format: jobFormat });
    return ok({ jobId, status: "pending" }, 200);
  }

  const out = await exportImageDesign({
    designId,
    versionNumber: targetVersion,
    format,
    quality: quality ?? 90,
  });

  const maxBytes = 100 * 1024 * 1024;
  if (out.fileSizeBytes > maxBytes) {
    return fail(
      "EXPORT_TOO_LARGE",
      "This export is too large. Consider exporting individual slides separately.",
      413
    );
  }

  // User-initiated exports count as implicit approvals for learning signals.
  await prisma.generationLog.updateMany({ where: { designId }, data: { wasApproved: true } });

  return ok({
    fileUrls: out.fileUrls,
    zipUrl: out.zipUrl,
    exportId: out.exportIds[out.exportIds.length - 1],
    fileSizeBytes: out.fileSizeBytes,
  });
}

