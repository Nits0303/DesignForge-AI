/**
 * Long-running worker: drains Redis queue `v1_generation_queue`.
 * Run: npx tsx src/scripts/v1GenerationWorker.ts
 * (Requires DATABASE_URL, REDIS_URL, AI keys — same as the Next.js app.)
 */
import { redis } from "@/lib/redis/client";
import { V1_GENERATION_QUEUE } from "@/lib/v1/enqueueApiGenerationJob";
import { processApiGenerationJob } from "@/lib/v1/processApiGenerationJob";

async function main() {
  // eslint-disable-next-line no-console
  console.log("[v1-generation-worker] started");
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const res = await redis.blpop(V1_GENERATION_QUEUE, 0);
    const jobId = Array.isArray(res) ? res[1] : null;
    if (!jobId) continue;
    // eslint-disable-next-line no-console
    console.log("[v1-generation-worker] job", jobId);
    await processApiGenerationJob(jobId);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[v1-generation-worker] fatal", err);
  process.exit(1);
});
