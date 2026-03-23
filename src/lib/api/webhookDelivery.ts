import crypto from "crypto";
import type { ApiKey } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { scheduleWebhookRetry } from "@/lib/webhooks/webhookRetryQueue";

export type WebhookEventType =
  | "design.generation.completed"
  | "design.generation.failed"
  | "design.revision.completed"
  | "export.completed"
  | "batch.completed"
  | "batch.item.completed";

export function signWebhookBody(secret: string, rawBody: string): string {
  const h = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${h}`;
}

/** Build JSON payload envelope for external webhooks */
export function buildWebhookPayload(args: {
  event: WebhookEventType;
  apiKeyId: string;
  data: Record<string, unknown>;
}) {
  return {
    event: args.event,
    timestamp: new Date().toISOString(),
    apiKeyId: args.apiKeyId,
    data: args.data,
  };
}

/**
 * POST to developer webhook URL. Retries should be scheduled via Redis sorted set (Sprint 18 worker).
 * For now performs a single attempt; queue integration can call this from a cron/worker.
 */
export async function deliverWebhookOnce(args: {
  apiKey: Pick<ApiKey, "webhookUrl" | "webhookSecret" | "id">;
  event: WebhookEventType;
  body: Record<string, unknown>;
  requestId?: string;
  /** Delivery attempt index (1 = first). Stored on WebhookDeliveryAttempt. */
  attemptNumber?: number;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const attemptNumber = args.attemptNumber ?? 1;
  if (!args.apiKey.webhookUrl || !args.apiKey.webhookSecret) {
    return { ok: false, error: "No webhook configured" };
  }

  const payloadObj = buildWebhookPayload({
    event: args.event,
    apiKeyId: args.apiKey.id,
    data: args.body,
  });
  const payload = JSON.stringify(payloadObj);

  const sig = signWebhookBody(args.apiKey.webhookSecret, payload);
  const reqId = args.requestId ?? crypto.randomUUID();

  const payloadJson = payloadObj as object;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);

  try {
    const res = await fetch(args.apiKey.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DesignForge-Signature": sig,
        "X-DesignForge-Event": args.event,
        "X-Request-ID": reqId,
      },
      body: payload,
      signal: ac.signal,
    });
    clearTimeout(t);
    const bodySnippet = await res.text().catch(() => "");
    const clipped = bodySnippet.slice(0, 500);
    await prisma.webhookDeliveryAttempt.create({
      data: {
        apiKeyId: args.apiKey.id,
        event: args.event,
        requestPayload: payloadJson,
        responseStatus: res.status,
        responseBody: clipped || null,
        attemptNumber,
        success: res.ok,
        deliveredAt: res.ok ? new Date() : null,
      },
    });
    if (!res.ok) {
      void scheduleWebhookRetry({
        apiKeyId: args.apiKey.id,
        event: args.event,
        body: args.body,
        afterAttempt: attemptNumber,
        requestId: reqId,
      });
    }
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    clearTimeout(t);
    const msg = e?.message ? String(e.message) : "delivery_failed";
    await prisma.webhookDeliveryAttempt.create({
      data: {
        apiKeyId: args.apiKey.id,
        event: args.event,
        requestPayload: payloadJson,
        responseStatus: null,
        responseBody: msg.slice(0, 500),
        attemptNumber,
        success: false,
        deliveredAt: null,
      },
    });
    void scheduleWebhookRetry({
      apiKeyId: args.apiKey.id,
      event: args.event,
      body: args.body,
      afterAttempt: attemptNumber,
      requestId: reqId,
    });
    return { ok: false, error: msg };
  }
}
