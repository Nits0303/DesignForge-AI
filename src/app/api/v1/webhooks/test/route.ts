import { NextRequest } from "next/server";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import { deliverWebhookOnce } from "@/lib/api/webhookDelivery";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return withV1Permission(req, "webhooks:test", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    const key = ctx.apiKeyRow;
    if (!key.webhookUrl?.trim()) {
      const res = v1Error(
        "WEBHOOK_NOT_CONFIGURED",
        "Set a webhook URL on this API key in Settings → Developer API.",
        requestId,
        400,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 400, { errorCode: "WEBHOOK_NOT_CONFIGURED" });
      return res;
    }

    const out = await deliverWebhookOnce({
      apiKey: key,
      event: "design.generation.completed",
      body: { test: true, message: "DesignForge webhook test delivery" },
      requestId,
    });

    if (!out.ok) {
      const res = v1Error(
        "WEBHOOK_DELIVERY_FAILED",
        out.error ?? `HTTP ${out.status ?? "error"}`,
        requestId,
        502,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 502, { errorCode: "WEBHOOK_DELIVERY_FAILED" });
      return res;
    }

    const res = v1Success({ delivered: true, httpStatus: out.status ?? null }, requestId, 200, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 200);
    return res;
  });
}
