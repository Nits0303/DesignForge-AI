import { randomUUID } from "crypto";
import { redis } from "@/lib/redis/client";
import type { WebhookEventType } from "@/lib/api/webhookDelivery";

const ZKEY = "webhook:retry_zset";
const MAX_ATTEMPTS = 5;

export type WebhookRetryPayload = {
  apiKeyId: string;
  event: WebhookEventType;
  body: Record<string, unknown>;
  /** The attempt number that will run next (2 = second try). */
  nextAttemptNumber: number;
  requestId?: string;
};

/** Schedule a retry after `afterAttempt` failed (afterAttempt=1 means first HTTP try failed). */
export async function scheduleWebhookRetry(
  payload: Omit<WebhookRetryPayload, "nextAttemptNumber"> & { afterAttempt: number }
): Promise<void> {
  const nextAttemptNumber = payload.afterAttempt + 1;
  if (nextAttemptNumber > MAX_ATTEMPTS) return;
  const delayMs = Math.min(30_000 * 2 ** (nextAttemptNumber - 2), 3_600_000);
  const runAt = Date.now() + delayMs;
  const member: WebhookRetryPayload = {
    apiKeyId: payload.apiKeyId,
    event: payload.event,
    body: payload.body,
    nextAttemptNumber,
    requestId: payload.requestId,
  };
  const memberStr = `${randomUUID()}:${JSON.stringify(member)}`;
  await redis.zadd(ZKEY, runAt, memberStr);
}

export async function popDueWebhookRetries(limit: number): Promise<WebhookRetryPayload[]> {
  const now = Date.now();
  const raw = await redis.zrangebyscore(ZKEY, 0, now, "LIMIT", 0, limit);
  const out: WebhookRetryPayload[] = [];
  for (const s of raw) {
    try {
      const jsonPart = s.includes(":") ? s.slice(s.indexOf(":") + 1) : s;
      const p = JSON.parse(jsonPart) as WebhookRetryPayload;
      await redis.zrem(ZKEY, s);
      out.push(p);
    } catch {
      await redis.zrem(ZKEY, s);
    }
  }
  return out;
}
