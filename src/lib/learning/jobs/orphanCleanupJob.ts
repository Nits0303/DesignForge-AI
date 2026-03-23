import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export async function orphanCleanupJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  cleanedDesignIds: string[];
  cleanedPreviewDesignIds: string[];
  timedOutExportJobIds: string[];
}> {
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // 1) Orphaned "generating" designs.
  const orphanedGenerating = await prisma.design.findMany({
    where: { status: "generating", createdAt: { lt: tenMinutesAgo } },
    select: { id: true },
  });

  const orphanedGeneratingIds = orphanedGenerating.map((d) => d.id);
  let updatedDesigns = 0;
  let updatedGenerationLogs = 0;

  if (orphanedGeneratingIds.length) {
    const resDesign = await prisma.design.updateMany({
      where: { id: { in: orphanedGeneratingIds } },
      data: { status: "archived" },
    });
    updatedDesigns += resDesign.count;

    const resLogs = await prisma.generationLog.updateMany({
      where: { designId: { in: orphanedGeneratingIds } },
      data: { wasApproved: false },
    });
    updatedGenerationLogs += resLogs.count;
  }

  // 2) Abandoned "preview" designs (keep status, only mark learning abandonment signal).
  const abandonedPreviews = await prisma.design.findMany({
    where: { status: "preview", updatedAt: { lt: sevenDaysAgo } },
    select: { id: true },
  });

  const abandonedPreviewIds = abandonedPreviews.map((d) => d.id);
  let updatedPreviewLogs = 0;

  if (abandonedPreviewIds.length) {
    const resPreviewLogs = await prisma.generationLog.updateMany({
      where: { designId: { in: abandonedPreviewIds } },
      data: { wasApproved: false },
    });
    updatedPreviewLogs += resPreviewLogs.count;
  }

  // 3) Queue cleanup: export jobs stuck in "processing" too long.
  const staleExportJobs = await prisma.exportJob.findMany({
    where: { status: "processing", updatedAt: { lt: fiveMinutesAgo } },
    select: { id: true, designId: true },
  });

  const timedOutExportJobIds = staleExportJobs.map((j) => j.id);
  if (timedOutExportJobIds.length) {
    await prisma.exportJob.updateMany({
      where: { id: { in: timedOutExportJobIds } },
      data: { status: "failed", errorMessage: "Export timed out" },
    });

    // Best-effort: remove from redis queue if still present.
    for (const jobId of timedOutExportJobIds) {
      try {
        await redis.lrem("export_queue", 0, jobId);
      } catch {
        // ignore
      }
    }
  }

  return {
    recordsProcessed: orphanedGeneratingIds.length + abandonedPreviewIds.length + timedOutExportJobIds.length,
    recordsUpdated: updatedDesigns + updatedGenerationLogs + updatedPreviewLogs + timedOutExportJobIds.length,
    cleanedDesignIds: orphanedGeneratingIds,
    cleanedPreviewDesignIds: abandonedPreviewIds,
    timedOutExportJobIds,
  };
}

