import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { exportFigmaBridge } from "@/lib/export/figmaBridgeExporter";

export const runtime = "nodejs";

const bodySchema = z.object({
  designId: z.string().cuid(),
  versionNumber: z.number().int().min(1).optional(),
});

/**
 * Creates a preview share link and a figma_push_ready notification so the Figma plugin can poll and offer one-click push.
 */
export async function POST(req: Request) {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const { designId, versionNumber } = parsed.data;

  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    select: { id: true, title: true, currentVersion: true },
  });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const limitsKey = `export:figma-plugin-notify:${userId}`;
  const rl = await checkRateLimit(limitsKey, { windowSeconds: 60 * 5, maxRequests: 30 });
  if (!rl.allowed) {
    return fail("RATE_LIMITED", "Too many requests. Try again shortly.", 429);
  }

  const targetVersion = versionNumber ?? design.currentVersion;
  const out = await exportFigmaBridge({ designId, versionNumber: targetVersion });

  const shareToken = out.shareUrl.split("/preview/")[1]?.split("?")[0] ?? "";

  await prisma.notification.create({
    data: {
      userId,
      type: "figma_push_ready",
      title: "Ready to push to Figma",
      body: `Design “${design.title.slice(0, 80)}” is ready in the plugin.`,
      isRead: false,
      actionUrl: out.shareUrl,
      metadata: {
        designId: design.id,
        versionNumber: targetVersion,
        shareToken,
        designTitle: design.title,
        shareUrl: out.shareUrl,
      } as any,
    },
  });

  return ok({
    shareUrl: out.shareUrl,
    expiresAt: out.expiresAt,
    message: "Open the DesignForge plugin in Figma — your design will appear ready to push.",
  });
}
