import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

import { exportImageDesign } from "@/lib/export/imageExporter";
import { exportPDFDesign } from "@/lib/export/pdfExporter";
import { exportFigmaBridge } from "@/lib/export/figmaBridgeExporter";
import { exportCodeZip } from "@/lib/export/codeExporter";
import { exportDesignThumbnail } from "@/lib/export/thumbnailExporter";

function parseJobFormat(format: string): { base: string; parts: string[] } {
  const [base, ...rest] = String(format ?? "").split("|");
  return { base, parts: rest };
}

async function processJob(jobId: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: "processing", errorMessage: null },
  });

  try {
    const maxBytes = 100 * 1024 * 1024;
    const { base, parts } = parseJobFormat(job.format);

    let resultUrl: string | undefined = undefined;

    if (base === "thumbnail") {
      const out = await exportDesignThumbnail({ designId: job.designId, versionNumber: job.versionNumber });
      resultUrl = out.thumbnailUrl;
    } else if (base === "png" || base === "jpg") {
      const fmt = base as "png" | "jpg";
      const qPart = parts.find((p) => p.startsWith("q="));
      const quality = qPart ? Number(qPart.slice("q=".length)) : 90;
      const out = await exportImageDesign({
        designId: job.designId,
        versionNumber: job.versionNumber,
        format: fmt,
        quality,
      });
      if (out.fileSizeBytes > maxBytes) {
        throw Object.assign(new Error("EXPORT_TOO_LARGE"), { code: "EXPORT_TOO_LARGE", retryable: false });
      }
      resultUrl = JSON.stringify({ fileUrls: out.fileUrls, zipUrl: out.zipUrl ?? null, exportIds: out.exportIds });
    } else if (base === "pdf") {
      const pageFormat = (parts[0] as any) || "A4";
      const landscape = parts[1] ? parts[1] === "landscape" || parts[1] === "true" : false;
      const out = await exportPDFDesign({
        designId: job.designId,
        versionNumber: job.versionNumber,
        pageFormat,
        landscape,
      });
      if (out.fileSizeBytes > maxBytes) {
        throw Object.assign(new Error("EXPORT_TOO_LARGE"), { code: "EXPORT_TOO_LARGE", retryable: false });
      }
      resultUrl = out.downloadUrl;
    } else if (base === "figma_bridge") {
      const out = await exportFigmaBridge({ designId: job.designId, versionNumber: job.versionNumber });
      resultUrl = out.shareUrl;
    } else if (base === "html_css") {
      const out = await exportCodeZip({ designId: job.designId, versionNumber: job.versionNumber });
      if (out.fileSizeBytes > maxBytes) {
        throw Object.assign(new Error("EXPORT_TOO_LARGE"), { code: "EXPORT_TOO_LARGE", retryable: false });
      }
      resultUrl = out.downloadUrl;
    } else {
      throw new Error(`Unknown export job format: ${job.format}`);
    }

    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: "complete", resultUrl: resultUrl ?? null, errorMessage: null },
    });
  } catch (err: any) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: err?.message ? String(err.message) : "Export failed",
        resultUrl: null,
      },
    });
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("[export-worker] started");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await redis.blpop("export_queue", 0);
    const jobId = Array.isArray(res) ? res[1] : null;
    if (!jobId) continue;
    // eslint-disable-next-line no-console
    console.log("[export-worker] processing job", jobId);
    await processJob(jobId);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[export-worker] fatal", err);
  process.exit(1);
});

