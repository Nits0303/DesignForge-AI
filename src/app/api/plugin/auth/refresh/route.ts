import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { hashPluginToken, validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

/** Rotates plugin token: invalidates current hash, returns new raw token once. */
export async function POST(req: Request) {
  const auth = await validatePluginBearer(req);
  if (!auth) {
    return fail("UNAUTHORIZED", "Invalid or expired token", 401);
  }

  const existing = await prisma.pluginToken.findUnique({
    where: { id: auth.tokenId },
    select: { userId: true, name: true },
  });
  if (!existing) {
    return fail("NOT_FOUND", "Token record missing", 404);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashPluginToken(rawToken);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.pluginToken.delete({ where: { id: auth.tokenId } }),
    prisma.pluginToken.create({
      data: {
        userId: existing.userId,
        tokenHash,
        name: existing.name,
        expiresAt,
      },
    }),
  ]);

  return ok({
    token: rawToken,
    expiresAt: expiresAt.toISOString(),
    message: "Copy this token now — it cannot be shown again.",
  });
}
