import { prisma } from "@/lib/db/prisma";
import { deliverWebhookOnce } from "@/lib/api/webhookDelivery";
import { popDueWebhookRetries } from "@/lib/webhooks/webhookRetryQueue";

export async function processWebhookRetriesBatch(limit = 15): Promise<number> {
  const items = await popDueWebhookRetries(limit);
  for (const p of items) {
    const key = await prisma.apiKey.findUnique({ where: { id: p.apiKeyId } });
    if (!key?.webhookUrl || !key.webhookSecret) continue;
    await deliverWebhookOnce({
      apiKey: key,
      event: p.event,
      body: p.body,
      requestId: p.requestId,
      attemptNumber: p.nextAttemptNumber,
    });
  }
  return items.length;
}
