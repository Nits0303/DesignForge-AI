import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

const RETRY_DELAYS_MS = [2000, 8000, 32000];
const FETCH_TIMEOUT_MS = 10_000;

export const WEBHOOK_EVENTS = [
  "test.started",
  "test.result_updated",
  "test.winner_detected",
  "test.completed",
  "test.promoted",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEventType(e: unknown): e is WebhookEventType {
  return typeof e === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(e);
}

async function logDelivery(
  webhookConfigId: string,
  event: string,
  payload: Record<string, unknown>,
  success: boolean,
  statusCode: number | undefined,
  errorMessage: string | undefined
) {
  await prisma.webhookDeliveryLog.create({
    data: {
      webhookConfigId,
      event,
      payload: payload as object,
      success,
      statusCode: statusCode ?? null,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function deliverWebhookOnce(
  config: { id: string; url: string; secret: string },
  event: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const url = String(config.url ?? "").trim();
  if (!url.startsWith("https://")) {
    await logDelivery(config.id, event, payload, false, undefined, "URL must use HTTPS");
    return { ok: false, error: "HTTPS only" };
  }

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  });
  const sig = crypto.createHmac("sha256", config.secret).update(body).digest("hex");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DesignForge-Signature": sig,
        },
        body,
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        await logDelivery(config.id, event, payload, false, res.status, "Redirect not followed");
        return { ok: false, statusCode: res.status, error: "Redirect" };
      }

      const text = await res.text().catch(() => "");
      const ok = res.ok;
      await logDelivery(config.id, event, payload, ok, res.status, ok ? undefined : text.slice(0, 500));
      if (ok) return { ok: true, statusCode: res.status };
      if (attempt < 2) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      else return { ok: false, statusCode: res.status, error: text.slice(0, 200) };
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Timeout" : String(e?.message ?? e);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      await logDelivery(config.id, event, payload, false, undefined, msg.slice(0, 500));
      return { ok: false, error: msg };
    }
  }
  return { ok: false, error: "exhausted retries" };
}

/** Fire-and-forget: deliver to all active webhook configs that subscribe to `event`. */
export function emitDesignForgeWebhook(event: WebhookEventType | string, payload: Record<string, unknown>) {
  setImmediate(() => {
    void (async () => {
      try {
        const configs = await prisma.webhookConfig.findMany({ where: { isActive: true } });
        for (const c of configs) {
          const events = (c.events as string[]) ?? [];
          if (!events.includes(event)) continue;
          await deliverWebhookOnce({ id: c.id, url: c.url, secret: c.secret }, event, payload);
        }
      } catch (e) {
        console.error("[emitDesignForgeWebhook]", e);
      }
    })();
  });
}
