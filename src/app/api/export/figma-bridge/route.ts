import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { exportFigmaBridge } from "@/lib/export/figmaBridgeExporter";

const bodySchema = z.object({
  designId: z.string().cuid(),
  versionNumber: z.number().int().min(1).optional(),
});

export const runtime = "nodejs";

function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function POST(req: Request) {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const { designId, versionNumber } = parsed.data;

  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    select: { id: true, currentVersion: true, platform: true, format: true },
  });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const targetVersion = versionNumber ?? design.currentVersion;

  const limitsKey = `export:figma-bridge:${userId}`;
  const rl = await checkRateLimit(limitsKey, { windowSeconds: 60 * 60, maxRequests: 20 });
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
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSeconds ?? 3600) },
      }
    );
  }

  // Reuse a still-valid share link if one exists.
  const existingShare = await prisma.shareLink.findFirst({
    where: {
      designId,
      versionNumber: targetVersion,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingShare) {
    const shareUrl = `${getAppBaseUrl()}/preview/${existingShare.token}`;

    const existingExport = await prisma.export.findFirst({
      where: {
        designId,
        versionNumber: targetVersion,
        format: "figma_bridge",
        figmaUrl: shareUrl,
      },
      select: { id: true },
    });

    if (!existingExport) {
      await prisma.export.create({
        data: {
          designId,
          versionNumber: targetVersion,
          format: "figma_bridge" as any,
          fileUrl: shareUrl,
          figmaUrl: shareUrl,
          fileSizeBytes: null,
        } as any,
      });
    }

    const instructions = [
      "Open Figma and install the html.to.design plugin (one-time setup).",
      "In Figma, open the html.to.design plugin.",
      "Paste the following URL into the plugin.",
      "Click Import — your design will appear as editable Figma layers.",
      "Note: the link expires in 24 hours.",
    ];

    return ok({ shareUrl, expiresAt: existingShare.expiresAt.toISOString(), instructions });
  }

  const out = await exportFigmaBridge({ designId, versionNumber: targetVersion });
  return ok({ shareUrl: out.shareUrl, expiresAt: out.expiresAt, instructions: out.instructions });
}

