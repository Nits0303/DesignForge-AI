import fs from "fs/promises";
import { join, basename } from "path";
import archiver from "archiver";

import { getStorageService } from "@/lib/storage";
import { prisma } from "@/lib/db/prisma";
import { exportImageDesign } from "@/lib/export/imageExporter";
import { exportPDFDesign } from "@/lib/export/pdfExporter";
import type { BatchJob } from "@prisma/client";

export type BulkExportFormatMode = "png" | "jpg" | "mixed";
export type BulkFilenameConvention = "by_platform" | "by_date" | "all_in_one";
export type BulkExportKind = "mixed" | "image" | "pdf" | "code" | "figma";

export type BulkExportItem = {
  designId: string;
  versionNumber: number;
  topic: string;
  date: string;
  platform: string;
  format: string;
};

function sanitizePart(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function storagePathFromFileUrl(fileUrl: string): string | null {
  const prefix = "/api/files/";
  if (!fileUrl.startsWith(prefix)) return null;
  return fileUrl.slice(prefix.length);
}

async function appendFromFileUrlsToArchive(args: {
  archive: any;
  fileUrls: string[];
  zipBaseDir: string;
  filenamePrefix: string;
}) {
  const { archive, fileUrls, zipBaseDir, filenamePrefix } = args;
  for (const fileUrl of fileUrls) {
    const storagePath = storagePathFromFileUrl(fileUrl);
    if (!storagePath) continue;
    const baseDir = process.env.LOCAL_STORAGE_PATH ?? "./storage";
    const abs = join(/* turbopackIgnore: true */ process.cwd(), baseDir, storagePath);
    const buf = await fs.readFile(abs);
    const name = `${zipBaseDir}/${filenamePrefix}_${basename(storagePath)}`;
    archive.append(buf, { name });
  }
}

export async function exportBatchZip(args: {
  batchJob: Pick<BatchJob, "id" | "userId" | "name">;
  items: BulkExportItem[];
  exportKind: BulkExportKind;
  formatMode: BulkExportFormatMode;
  jpgQuality: number;
  filenameConvention: BulkFilenameConvention;
  onProgress?: (p: { processed: number; total: number; currentDesignTitle: string }) => void;
}): Promise<{ zipUrl: string }> {
  const { batchJob, items, exportKind, formatMode, jpgQuality, filenameConvention, onProgress } = args;
  const total = items.length;

  const storage = getStorageService();

  const ts = Date.now();
  const zipPath = `exports/bulk/${batchJob.id}/${ts}/batch_export.zip`;

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const zipPromise = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (d: any) => chunks.push(Buffer.from(d)));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });

  function getZipDir(it: BulkExportItem) {
    if (filenameConvention === "by_platform") return sanitizePart(it.platform);
    if (filenameConvention === "by_date") return sanitizePart(it.date);
    return "";
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;

    onProgress?.({ processed: i, total, currentDesignTitle: it.topic });

    const zipBaseDir = getZipDir(it);
    const zipBaseDirFixed = zipBaseDir ? zipBaseDir : "batch_export";
    const filenamePrefix = sanitizePart(it.topic || "design") || "design";

    const platformLower = String(it.platform ?? "").toLowerCase();
    const isWeb = ["website", "dashboard"].includes(platformLower);

    if (exportKind === "pdf" || (exportKind === "mixed" && isWeb)) {
      const res = await exportPDFDesign({
        designId: it.designId,
        versionNumber: it.versionNumber,
        pageFormat: "A4",
        landscape: false,
      });
      await appendFromFileUrlsToArchive({
        archive,
        fileUrls: [res.downloadUrl],
        zipBaseDir: zipBaseDirFixed,
        filenamePrefix,
      });
    } else if (exportKind === "image" || (exportKind === "mixed" && !isWeb)) {
      const imgFormat = formatMode === "jpg" ? "jpg" : formatMode === "png" ? "png" : isWeb ? "png" : "png";
      const res = await exportImageDesign({
        designId: it.designId,
        versionNumber: it.versionNumber,
        format: imgFormat as any,
        quality: imgFormat === "jpg" ? jpgQuality : 90,
      });
      await appendFromFileUrlsToArchive({ archive, fileUrls: res.fileUrls, zipBaseDir: zipBaseDirFixed, filenamePrefix });

      if (res.zipUrl) {
        // Carousel export zip (if generated).
        await appendFromFileUrlsToArchive({ archive, fileUrls: [res.zipUrl], zipBaseDir: zipBaseDirFixed, filenamePrefix: `${filenamePrefix}_carousel` });
      }
    } else if (exportKind === "code") {
      const res = await (await import("@/lib/export/codeExporter")).exportCodeZip({
        designId: it.designId,
        versionNumber: it.versionNumber,
      });
      await appendFromFileUrlsToArchive({ archive, fileUrls: [res.downloadUrl], zipBaseDir: zipBaseDirFixed, filenamePrefix });
    } else if (exportKind === "figma") {
      const res = await (await import("@/lib/export/figmaBridgeExporter")).exportFigmaBridge({
        designId: it.designId,
        versionNumber: it.versionNumber,
      });
      // For figma export we keep links + instructions in the README instead of embedding remote URLs.
      archive.append(
        `${it.topic} (${it.platform}/${it.format}) -> ${res.shareUrl}\n${res.instructions.map((x) => `- ${x}`).join("\n")}\n`,
        { name: `batch_export/figma_links/${sanitizePart(it.topic || it.designId)}.txt` }
      );
    }
  }

  // README
  const readme = [
    `Batch job: ${batchJob.name}`,
    `Export date: ${new Date().toISOString()}`,
    `Total designs: ${items.length}`,
    `Generated by DesignForge AI`,
    "",
    "Notes:",
    "This is a simplified bulk exporter that bundles the latest approved/current versions.",
    `Export kind: ${exportKind}`,
  ].join("\n");

  archive.append(readme, { name: "batch_export/README.txt" });

  archive.finalize();
  const zipBuf = await zipPromise;
  const zipUrl = await storage.upload(zipBuf, zipPath, "application/zip");
  onProgress?.({ processed: total, total, currentDesignTitle: "done" });
  return { zipUrl };
}

