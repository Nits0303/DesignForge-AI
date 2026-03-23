import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { exportCodeZip } from "@/lib/export/codeExporter";

const bodySchema = z.object({
  designId: z.string().cuid(),
  versionNumber: z.number().int().min(1).optional(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const { designId, versionNumber } = parsed.data;

  const design = await prisma.design.findFirst({ where: { id: designId, userId }, select: { id: true, currentVersion: true } });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const limitsKey = `export:code:${userId}`;
  const rl = await checkRateLimit(limitsKey, { windowSeconds: 60 * 60, maxRequests: 50 });
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
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSeconds ?? 3600) } }
    );
  }

  const targetVersion = versionNumber ?? design.currentVersion;

  const existing = await prisma.export.findFirst({
    where: { designId, versionNumber: targetVersion, format: "html_css" as any },
    select: { id: true, fileUrl: true, fileSizeBytes: true },
  });

  if (existing) {
    await prisma.generationLog.updateMany({ where: { designId }, data: { wasApproved: true } });
    return ok({ downloadUrl: existing.fileUrl, exportId: existing.id, fileSizeBytes: existing.fileSizeBytes ?? null });
  }

  const out = await exportCodeZip({ designId, versionNumber: targetVersion });
  const maxBytes = 100 * 1024 * 1024;
  if (out.fileSizeBytes > maxBytes) {
    return fail("EXPORT_TOO_LARGE", "The ZIP is too large (>100MB). Export individual slides instead.", 413);
  }
  await prisma.generationLog.updateMany({ where: { designId }, data: { wasApproved: true } });

  return ok({ downloadUrl: out.downloadUrl, exportId: out.exportId, fileSizeBytes: out.fileSizeBytes });
}

