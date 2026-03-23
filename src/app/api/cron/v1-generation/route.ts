import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { processApiGenerationJob, popOneV1GenerationJobId } from "@/lib/v1/processApiGenerationJob";

export const runtime = "nodejs";

/** Drain up to `batch` jobs from Redis queue (for workers / Vercel cron). */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return fail("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  const sp = req.nextUrl.searchParams;
  const batch = Math.min(20, Math.max(1, parseInt(sp.get("batch") ?? "5", 10) || 5));
  let processed = 0;
  for (let i = 0; i < batch; i++) {
    const id = await popOneV1GenerationJobId();
    if (!id) break;
    await processApiGenerationJob(id);
    processed += 1;
  }
  return ok({ processed }, 200);
}
