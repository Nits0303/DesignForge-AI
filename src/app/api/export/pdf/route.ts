import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { exportPDFDesign } from "@/lib/export/pdfExporter";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";

const bodySchema = z.object({
  designId: z.string().cuid(),
  versionNumber: z.number().int().min(1).optional(),
  pageFormat: z.enum(["A4", "A3", "Letter"]).optional(),
  landscape: z.boolean().optional(),
});

function estimatedSecondsForPdf(slideCount: number) {
  return slideCount * 1.5 + 2.0;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getRequiredSession();
  const userId = session.user.id;

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const { designId, versionNumber, pageFormat = "A4", landscape = false } = parsed.data;

  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    select: { id: true, currentVersion: true },
  });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const targetVersion = versionNumber ?? design.currentVersion;
  const version = await prisma.designVersion.findUnique({
    where: { designId_versionNumber: { designId, versionNumber: targetVersion } },
  });
  if (!version) return fail("NOT_FOUND", "Design version not found", 404);

  const parsedSlides = parseSlidesFromHtml(version.htmlContent);
  const slideCount = parsedSlides.type === "single" ? 1 : Math.max(parsedSlides.slides.length, 2);

  const rl = await checkRateLimit(`export:pdf:${userId}`, { windowSeconds: 60 * 60, maxRequests: 10 });
  if (!rl.allowed) {
    const reset = new Date(Date.now() + (rl.retryAfterSeconds ?? 3600) * 1000).toISOString();
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Export limit reached. You can export ${rl.limit} designs per hour. Try again at ${reset}.`,
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSeconds ?? 3600),
        },
      }
    );
  }

  // Cache check
  const existing = await prisma.export.findFirst({
    where: { designId, versionNumber: targetVersion, format: "pdf" as any },
    select: { id: true, fileUrl: true, fileSizeBytes: true },
  });
  if (existing) {
    return ok({ downloadUrl: existing.fileUrl, exportId: existing.id, fileSizeBytes: existing.fileSizeBytes ?? null });
  }

  const estimateSeconds = estimatedSecondsForPdf(slideCount);
  if (estimateSeconds > 5) {
    const jobFormat = `pdf|${pageFormat}|${landscape ? "landscape" : "portrait"}`;
    const { jobId } = await enqueueExportJob({ designId, versionNumber: targetVersion, format: jobFormat });
    return ok({ jobId, status: "pending" }, 200);
  }

  const out = await exportPDFDesign({ designId, versionNumber: targetVersion, pageFormat, landscape });
  const maxBytes = 100 * 1024 * 1024;
  if (out.fileSizeBytes > maxBytes) {
    return fail("EXPORT_TOO_LARGE", "PDF is too large (>100MB). Export individual slides instead.", 413);
  }
  return ok({ downloadUrl: out.downloadUrl, exportId: out.exportId, fileSizeBytes: out.fileSizeBytes });
}

