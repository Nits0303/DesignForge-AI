import { NextRequest } from "next/server";
import { redis, scanRedisKeys } from "@/lib/redis/client";
import { fail, ok } from "@/lib/api/response";
import { notifyContributorInstallDigest } from "@/lib/notifications/marketplaceNotifications";
import { INSTALL_DIGEST_PREFIX } from "@/lib/marketplace/installDigest";

export const runtime = "nodejs";

/** Flush yesterday's per-contributor install tallies into a single notification each. */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return fail("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pattern = `${INSTALL_DIGEST_PREFIX}*:${yesterday}`;
  const keys = await scanRedisKeys(pattern);
  let sent = 0;

  for (const key of keys) {
    const rest = key.slice(INSTALL_DIGEST_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon <= 0) continue;
    const userId = rest.slice(0, colon);
    const day = rest.slice(colon + 1);
    if (day !== yesterday) continue;

    const raw = await redis.get(key);
    if (!raw) continue;
    const data = JSON.parse(raw) as Record<string, { name: string; count: number }>;
    const lines = Object.values(data).map((d) => `“${d.name.slice(0, 40)}” +${d.count}`);
    const total = Object.values(data).reduce((s, d) => s + d.count, 0);
    await notifyContributorInstallDigest({ contributorUserId: userId, lines, totalInstalls: total });
    await redis.del(key);
    sent += 1;
  }

  return ok({ processedKeys: keys.length, notificationsSent: sent, date: yesterday }, 200);
}
