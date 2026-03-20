import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export async function enqueueExportJob({
  designId,
  versionNumber,
  format,
}: {
  designId: string;
  versionNumber: number;
  format: string;
}): Promise<{ jobId: string }> {
  const job = await prisma.exportJob.create({
    data: {
      designId,
      versionNumber,
      format,
      status: "pending",
    } as any,
  });

  // FIFO-ish: push to the right and worker pops from left.
  await redis.rpush("export_queue", job.id);
  return { jobId: job.id };
}

