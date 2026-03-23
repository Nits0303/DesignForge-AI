import { redis } from "@/lib/redis/client";

const TTL_SEC = 120;

export function pluginDesignsCacheKey(
  userId: string,
  page: number,
  limit: number,
  search: string,
  platform: string
) {
  return `plugin:designs:${userId}:${page}:${limit}:${search}:${platform}`;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", TTL_SEC);
  } catch {
    // non-fatal
  }
}

/**
 * Invalidates all cached pages for GET /api/plugin/designs for a user.
 * Uses SCAN — safe for production Redis.
 */
export async function invalidatePluginDesignsCacheForUser(userId: string): Promise<void> {
  if (!userId) return;
  const pattern = `plugin:designs:${userId}:*`;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    // non-fatal
  }
}
