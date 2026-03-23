import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export const V1_GENERATION_QUEUE = "v1_generation_queue";

export type ApiGenInput = {
  prompt: string;
  brandId?: string;
  projectId?: string;
};

export async function enqueueApiGenerationJob(args: {
  userId: string;
  apiKeyId: string | null;
  clientRequestId: string | null;
  input: ApiGenInput;
}): Promise<{ jobId: string }> {
  const job = await prisma.apiGenerationJob.create({
    data: {
      userId: args.userId,
      apiKeyId: args.apiKeyId,
      clientRequestId: args.clientRequestId,
      input: args.input as object,
      status: "queued",
    },
  });
  await redis.rpush(V1_GENERATION_QUEUE, job.id);
  return { jobId: job.id };
}
