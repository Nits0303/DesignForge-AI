import { prisma } from "@/lib/db/prisma";

export async function recalculateBatchJobFromItems(batchJobId: string, userId?: string): Promise<void> {
  const batch = await prisma.batchJob.findFirst({
    where: userId ? { id: batchJobId, userId } : { id: batchJobId },
    select: { id: true, status: true },
  });
  if (!batch) return;

  const items = await prisma.batchItem.findMany({
    where: { batchJobId },
    select: { id: true, status: true },
  });

  const total = items.length;
  const failedCount = items.filter((it) => it.status === "failed").length;
  const completedCount = items.filter((it) => it.status === "complete" || it.status === "approved").length;
  const inProgressCount = items.filter((it) => ["pending", "generating", "revision_requested"].includes(it.status)).length;

  // If the user cancelled, keep cancelled.
  if (batch.status === "cancelled") return;

  let derivedStatus: "processing" | "completed" | "failed" | "partial" = "processing";
  if (inProgressCount > 0) derivedStatus = "processing";
  else if (failedCount === total && total > 0) derivedStatus = "failed";
  else if (failedCount === 0 && completedCount === total && total > 0) derivedStatus = "completed";
  else derivedStatus = "partial";

  await prisma.batchJob.update({
    where: { id: batchJobId },
    data: {
      completedItems: completedCount,
      failedItems: failedCount,
      status: derivedStatus,
      completedAt: ["completed", "failed", "partial"].includes(derivedStatus) ? new Date() : null,
    } as any,
  });
}

