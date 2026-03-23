import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { processWebhookRetriesBatch } from "@/lib/webhooks/processWebhookRetries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return fail("UNAUTHORIZED", "Invalid cron secret", 401);
  }
  const n = await processWebhookRetriesBatch(25);
  return ok({ processed: n }, 200);
}
