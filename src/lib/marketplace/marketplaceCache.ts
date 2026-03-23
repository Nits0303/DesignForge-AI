import { redis, scanRedisKeys } from "@/lib/redis/client";

/** Invalidate all cached marketplace list responses (query-param hashed keys). */
export async function invalidateMarketplaceListCache(): Promise<void> {
  try {
    const keys = await scanRedisKeys("marketplace:list:*");
    if (keys.length) await redis.del(...keys);
  } catch {
    // non-fatal
  }
}

export async function invalidateMarketplaceDetailCache(templateId: string): Promise<void> {
  try {
    await redis.del(`marketplace:detail:${templateId}`);
  } catch {
    // ignore
  }
}
