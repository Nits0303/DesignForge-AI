import cron from "node-cron";
import { prisma } from "@/lib/db/prisma";
import { getStorageService, storagePathFromPublicUrl } from "@/lib/storage";

async function cleanup() {
  const storage = getStorageService();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Delete expired exports (files only).
  const expiredExports = await prisma.export.findMany({
    where: {
      createdAt: { lt: sevenDaysAgo },
      format: { not: "figma_bridge" },
    },
    select: { id: true, fileUrl: true },
  });

  let deletedFiles = 0;
  for (const e of expiredExports) {
    const filePath = storagePathFromPublicUrl(e.fileUrl);
    if (!filePath) continue;
    try {
      await storage.delete(filePath);
      deletedFiles += 1;
    } catch {
      // best-effort
    }
  }

  const exportIds = expiredExports.map((e) => e.id);
  if (exportIds.length) {
    await prisma.export.deleteMany({ where: { id: { in: exportIds } } });
  }

  // Delete expired share links (wasted DB rows only).
  const expiredShareLinks = await prisma.shareLink.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true },
  });
  if (expiredShareLinks.length) {
    await prisma.shareLink.deleteMany({ where: { id: { in: expiredShareLinks.map((s) => s.id) } } });
  }

  // Delete old completed/failed export jobs.
  await prisma.exportJob.deleteMany({
    where: {
      status: { in: ["complete", "failed"] },
      createdAt: { lt: threeDaysAgo },
    },
  });

  // Delete unsaved/session-only references older than 7 days.
  const staleRefs = await prisma.referenceImage.findMany({
    where: {
      isSaved: false,
      createdAt: { lt: sevenDaysAgo },
    },
    select: { id: true, visionUrl: true, thumbnailUrl: true },
  });

  let deletedRefFiles = 0;
  for (const r of staleRefs) {
    const vp = storagePathFromPublicUrl(r.visionUrl);
    const tp = storagePathFromPublicUrl(r.thumbnailUrl);
    if (vp) {
      await storage.delete(vp).then(() => {
        deletedRefFiles += 1;
      }).catch(() => {});
    }
    if (tp) {
      await storage.delete(tp).then(() => {
        deletedRefFiles += 1;
      }).catch(() => {});
    }
  }
  if (staleRefs.length > 0) {
    await prisma.referenceImage.deleteMany({
      where: { id: { in: staleRefs.map((r) => r.id) } },
    });
  }

  // eslint-disable-next-line no-console
  console.log("[export-cleanup-cron]", {
    deletedFiles,
    deletedExportRecords: exportIds.length,
    deletedShareLinks: expiredShareLinks.length,
    deletedUnsavedReferences: staleRefs.length,
    deletedReferenceFiles: deletedRefFiles,
  });
}

cron.schedule("0 3 * * *", () => {
  cleanup().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[export-cleanup-cron] failed", err);
  });
}, { timezone: "UTC" });

// eslint-disable-next-line no-console
console.log("[export-cleanup-cron] scheduled");

