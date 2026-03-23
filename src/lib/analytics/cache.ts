import { redis } from "@/lib/redis/client";

const ANALYTICS_CACHE_TTL_SECONDS = 30 * 60;
const ANALYTICS_SWR_REFRESH_AGE_MS = 15 * 60 * 1000;

export async function getAnalyticsCacheEntry<T>(key: string): Promise<{
  data: T;
  cachedAt: string;
} | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { data: T; cachedAt: string };
    if (!parsed?.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setAnalyticsCacheEntry<T>(key: string, entry: { data: T; cachedAt: Date }): Promise<void> {
  await redis.set(key, JSON.stringify({ data: entry.data, cachedAt: entry.cachedAt.toISOString() }), "EX", ANALYTICS_CACHE_TTL_SECONDS);
}

export async function getAnalyticsOrCompute<T>(params: {
  key: string;
  compute: () => Promise<T>;
  force?: boolean;
}): Promise<{ data: T; cachedAt: string }> {
  if (!params.force) {
    const cached = await getAnalyticsCacheEntry<T>(params.key);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
      if (ageMs > ANALYTICS_SWR_REFRESH_AGE_MS) {
        // SWR: serve cached immediately and refresh in background.
        void (async () => {
          try {
            const fresh = await params.compute();
            await setAnalyticsCacheEntry(params.key, { data: fresh, cachedAt: new Date() });
          } catch {
            // best effort
          }
        })();
      }
      return cached;
    }
  }

  const data = await params.compute();
  const cachedAt = new Date();
  await setAnalyticsCacheEntry(params.key, { data, cachedAt });
  return { data, cachedAt: cachedAt.toISOString() };
}

async function delByRedisMatch(match: string) {
  let cursor = "0";
  const toDelete: string[] = [];

  // Cursor-based SCAN to avoid KEYS on production.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await redis.scan(cursor, "MATCH", match, "COUNT", 500);
    cursor = res[0];
    const keys = res[1] as string[];
    if (keys?.length) toDelete.push(...keys);
    if (cursor === "0") break;
  }

  if (toDelete.length) {
    await redis.del(...toDelete);
  }
}

export async function invalidateAnalyticsCaches(): Promise<void> {
  await delByRedisMatch("analytics:*");
}

export { ANALYTICS_CACHE_TTL_SECONDS };

