import { randomUUID } from "crypto";
import { redis } from "@/lib/redis/client";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds?: number;
};

/** ioredis multi().exec() returns [err, reply] tuples per command — not raw values. */
function unwrapExecReply<T>(tuple: unknown): T | null {
  if (!Array.isArray(tuple) || tuple.length < 2) return null;
  const [err, reply] = tuple as [Error | null, T];
  if (err) return null;
  return reply ?? null;
}

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
  // Unique member so two requests in the same ms don't collapse to one ZSET entry.
  tx.zadd(zkey, now, `${now}:${randomUUID()}`);
  tx.zcard(zkey);
  tx.expire(zkey, windowSeconds);

  let count = 0;
  try {
    const results = await tx.exec();
    const zcardReply = results?.[2];
    const raw = unwrapExecReply<number | string>(zcardReply);
    count = typeof raw === "number" ? raw : Number(raw ?? 0);
  } catch {
    // Redis unavailable — fail open so local dev / transient outages don't block all traffic.
    return {
      allowed: true,
      remaining: maxRequests,
      limit: maxRequests,
    };
  }

  if (Number.isNaN(count)) {
    return {
      allowed: true,
      remaining: maxRequests,
      limit: maxRequests,
    };
  }

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

