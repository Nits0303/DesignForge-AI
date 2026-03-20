import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  versionNumber: z.number().int().min(1),
});

async function invalidateDesignCaches(userId: string) {
  try {
    const keys = await redis.keys(`designs:list:${userId}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.del(`designs:recent:${userId}`);
    await redis.del(`dashboard:stats:${userId}`);
  } catch {
    // best-effort
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id } = await context.params;
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const design = await prisma.design.findFirst({
      where: { id, userId },
    });
    if (!design) return fail("NOT_FOUND", "Design not found", 404);

    const baseVersion = await prisma.designVersion.findUnique({
      where: {
        designId_versionNumber: { designId: id, versionNumber: parsed.data.versionNumber },
      },
    });
    if (!baseVersion) return fail("NOT_FOUND", "Version not found", 404);

    const nextVersion = design.currentVersion + 1;
    const restored = await prisma.designVersion.create({
      data: {
        designId: id,
        versionNumber: nextVersion,
        htmlContent: baseVersion.htmlContent,
        revisionPrompt: "Restore previous version",
        aiModelUsed: baseVersion.aiModelUsed,
        promptTokens: baseVersion.promptTokens,
        completionTokens: baseVersion.completionTokens,
        cachedTokens: baseVersion.cachedTokens,
        generationTimeMs: baseVersion.generationTimeMs,
      },
    });

    const updated = await prisma.design.update({
      where: { id },
      data: { currentVersion: nextVersion, status: "preview" },
    });

    await invalidateDesignCaches(userId);
    return ok({ design: updated, restoredVersionId: restored.id, versionNumber: nextVersion }, 201);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

