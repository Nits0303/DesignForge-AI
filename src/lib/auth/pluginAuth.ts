import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

export function hashPluginToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Validates `Authorization: Bearer <token>` for plugin API routes.
 * Updates lastUsedAt on success.
 */
export async function validatePluginBearer(
  req: Request
): Promise<{ userId: string; tokenId: string; expiresAt: Date } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m?.[1]) return null;
  const raw = m[1].trim();
  if (!raw) return null;

  const tokenHash = hashPluginToken(raw);

  const row = await prisma.pluginToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  await prisma.pluginToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return { userId: row.userId, tokenId: row.id, expiresAt: row.expiresAt };
}

export function getMinimumPluginVersion(): string {
  return process.env.MINIMUM_PLUGIN_VERSION ?? "1.0.0";
}
