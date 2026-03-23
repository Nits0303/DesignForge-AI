import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { generateRawApiKey, hashApiKey } from "@/lib/api/apiKeyFactory";

export const runtime = "nodejs";

/** Atomic rotate: revoke old key and create new with same config. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await ctx.params;

    const old = await prisma.apiKey.findFirst({
      where: { id, userId: session.user.id, status: "active" },
    });
    if (!old) return fail("NOT_FOUND", "Active API key not found", 404);

    const perms = Array.isArray(old.permissions)
      ? (old.permissions as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

    const result = await prisma.$transaction(async (tx) => {
      await tx.apiKey.update({
        where: { id: old.id },
        data: { status: "revoked" },
      });
      const rawKey = generateRawApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.slice(0, 8);
      const created = await tx.apiKey.create({
        data: {
          userId: old.userId,
          teamId: old.teamId,
          name: old.name,
          keyPrefix,
          keyHash,
          permissions: old.permissions as object,
          status: "active",
          expiresAt: old.expiresAt,
          rateLimitTier: old.rateLimitTier,
          webhookUrl: old.webhookUrl,
          webhookSecret: old.webhookSecret,
          webhookBatchItemEvents: old.webhookBatchItemEvents,
        },
      });
      return { rawKey, created };
    });

    return ok(
      {
        rawKey: result.rawKey,
        key: result.created,
        message: "Copy the new key now — the old key is revoked.",
      },
      200
    );
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Rotate failed", 500);
  }
}
