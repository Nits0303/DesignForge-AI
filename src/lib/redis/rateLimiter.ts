import { redis } from "@/lib/redis/client";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds?: number;
};

/**
 * Sliding window rate limit using Redis sorted sets.
 */
export async function checkRateLimit(
  key: string,
  {
    windowSeconds,
    maxRequests,
  }: {
    windowSeconds: number;
    maxRequests: number;
  }
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const zkey = `rl:${key}`;

  const tx = redis.multi();
  tx.zremrangebyscore(zkey, 0, windowStart);
  tx.zadd(zkey, now, `${now}`);
  tx.zcard(zkey);
  tx.expire(zkey, windowSeconds);

  const [, , countRaw] = (await tx.exec()) ?? [];
  const count = typeof countRaw === "number" ? countRaw : Number(countRaw ?? 0);

  if (count <= maxRequests) {
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - count),
      limit: maxRequests,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    limit: maxRequests,
    retryAfterSeconds: windowSeconds,
  };
}

