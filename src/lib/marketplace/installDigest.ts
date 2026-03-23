import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export const INSTALL_DIGEST_PREFIX = "marketplace:install_digest:";

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Record an install for daily contributor digest (batched notification). */
export async function recordInstallForDigest(templateId: string): Promise<void> {
  try {
    const t = await prisma.template.findUnique({
      where: { id: templateId },
      select: { contributorUserId: true, name: true },
    });
    if (!t?.contributorUserId) return;

    const key = `${INSTALL_DIGEST_PREFIX}${t.contributorUserId}:${dayKey()}`;
    const raw = await redis.get(key);
    const data = raw ? (JSON.parse(raw) as Record<string, { name: string; count: number }>) : {};
    const cur = data[templateId];
    data[templateId] = { name: t.name, count: (cur?.count ?? 0) + 1 };
    await redis.set(key, JSON.stringify(data), "EX", 60 * 60 * 48);
  } catch {
    // non-fatal
  }
}
