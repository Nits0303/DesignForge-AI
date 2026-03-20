import { prisma } from "@/lib/db/prisma";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { getStorageService } from "@/lib/storage";
import { puppeteerClient } from "@/lib/export/puppeteerClient";
import { parse } from "node-html-parser";

import type { ParsedIntent } from "@/types/ai";
import type { ExportFormat } from "@prisma/client";
import type { BrandProfile } from "@prisma/client";

import archiver from "archiver";

type ImageFormat = "png" | "jpg";

function normaliseDims(dimensions: any): { width: number; height: number } {
  if (!dimensions) return { width: 1080, height: 1080 };
  if (typeof dimensions === "object" && typeof dimensions.width === "number" && typeof dimensions.height === "number") {
    return dimensions;
  }
  if (Array.isArray(dimensions) && dimensions[0]) {
    const d0 = dimensions[0] as any;
    return { width: Number(d0.width) || 1080, height: Number(d0.height) || 1080 };
  }
  return { width: 1080, height: 1080 };
}

function buildIntent(design: {
  platform: string;
  format: string;
  dimensions: any;
  parsedIntent: any;
}): ParsedIntent {
  if (design.parsedIntent) return design.parsedIntent as ParsedIntent;
  return {
    platform: design.platform as any,
    format: design.format,
    dimensions: design.dimensions as any,
  };
}

function isWebPlatform(platform: string) {
  return ["website", "dashboard"].includes((platform ?? "").toLowerCase());
}

function imageMime(format: ImageFormat) {
  return format === "jpg" ? "image/jpeg" : "image/png";
}

export type ImageExportRenderResult = {
  fileUrls: string[];
  slideFileUrls?: string[];
  zipUrl?: string;
  fileSizeBytes: number;
  exportIds: string[];
};

export async function exportImageDesign({
  designId,
  versionNumber,
  format,
  quality = 90,
  exportSectionsIndividually = false,
}: {
  designId: string;
  versionNumber?: number | null;
  format: ImageFormat;
  quality?: number;
  exportSectionsIndividually?: boolean;
}): Promise<ImageExportRenderResult> {
  const design = await prisma.design.findFirst({
    where: { id: designId },
    include: {
      brand: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!design || !design.brand) {
    throw Object.assign(new Error("Design or brand not found"), { code: "NOT_FOUND" });
  }

  const targetVersionNumber = versionNumber ?? design.currentVersion;

  const version = await prisma.designVersion.findUnique({
    where: { designId_versionNumber: { designId, versionNumber: targetVersionNumber } },
  });

  if (!version) throw new Error("Design version not found");

  const html = version.htmlContent;
  const intent = buildIntent({
    platform: design.platform,
    format: design.format,
    dimensions: design.dimensions,
    parsedIntent: design.parsedIntent,
  });

  const brand = design.brand as any as BrandProfile;

  const processed = await postProcessHtml({
    html,
    intent,
    brand: { name: brand.name, typography: brand.typography as any, colors: brand.colors as any },
  });

  const parsed = parseSlidesFromHtml(processed.html);
  const slides = parsed.slides.length ? parsed.slides : [processed.html];

  const processedDoc = parse(processed.html);
  const sectionNodes = processedDoc.querySelectorAll('section[data-section-type]');

  const dims = normaliseDims(design.dimensions);
  const width = dims.width;
  const height = dims.height;

  const platform = (intent.platform ?? design.platform ?? "").toLowerCase();
  const heightParam: number | "auto" = isWebPlatform(platform) ? "auto" : height;

  const storage = getStorageService();

  const fileUrls: string[] = [];
  const exportIds: string[] = [];
  const slideFileUrls: string[] = [];
  let totalSize = 0;

  const storageBase = `exports/${designId}/${targetVersionNumber}`;

  const shouldExportSections = exportSectionsIndividually && sectionNodes.length > 0 && isWebPlatform(platform);

  // Sequential rendering to protect Puppeteer under load.
  if (shouldExportSections) {
    const headHtml = processedDoc.querySelector("head")?.toString() ?? "";
    for (let i = 0; i < sectionNodes.length; i++) {
      const n = i + 1;
      const sectionType = sectionNodes[i]?.getAttribute("data-section-type") ?? `section_${n}`;
      const sectionDoc = `<!DOCTYPE html><html><head>${headHtml}</head><body>${sectionNodes[i].toString()}</body></html>`;
      const outPath = `${storageBase}/section_${String(n).padStart(2, "0")}_${sectionType}.${format}`;

      const buf = await puppeteerClient.screenshot({
        html: sectionDoc,
        width,
        height: heightParam,
        format,
        quality,
        waitUntil: "networkidle0",
        scale: 2,
      });

      const mime = imageMime(format);
      const fileUrl = await storage.upload(buf, outPath, mime);
      fileUrls.push(fileUrl);
      totalSize += buf.length;

      const exportFormat = format as ExportFormat;
      const exportRec = await prisma.export.create({
        data: {
          designId,
          versionNumber: targetVersionNumber,
          format: exportFormat,
          fileUrl,
          fileSizeBytes: buf.length,
        },
      });
      exportIds.push(exportRec.id);
    }
  } else for (let i = 0; i < slides.length; i++) {
    const n = i + 1;
    const slideHtml = slides[i];

    const outPath =
      slides.length > 1 ? `${storageBase}/slide_${String(n).padStart(2, "0")}.${format}` : `${storageBase}/design.${format}`;

    const buf = await puppeteerClient.screenshot({
      html: slideHtml,
      width,
      height: heightParam,
      format,
      quality,
      waitUntil: "networkidle0",
      scale: 2,
    });

    const mime = imageMime(format);
    const fileUrl = await storage.upload(buf, outPath, mime);
    fileUrls.push(fileUrl);
    slideFileUrls.push(fileUrl);
    totalSize += buf.length;

    const exportFormat = format as ExportFormat;
    const exportRec = await prisma.export.create({
      data: {
        designId,
        versionNumber: targetVersionNumber,
        format: exportFormat,
        fileUrl,
        fileSizeBytes: buf.length,
      },
    });
    exportIds.push(exportRec.id);
  }

  let zipUrl: string | undefined = undefined;

  if (slides.length > 1) {
    // Bundle multi-slide exports into ZIP.
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    const zipPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on("data", (d: any) => chunks.push(Buffer.from(d)));
      archive.on("error", reject);
      archive.on("end", () => resolve(Buffer.concat(chunks)));
    });

    slides.forEach((_, idx) => {
      const n = idx + 1;
      const expectedPath = slides.length > 1
        ? `${storageBase}/slide_${String(n).padStart(2, "0")}.${format}`
        : `${storageBase}/design.${format}`;
      // We already uploaded individual images; zip should include them as buffers.
      // Instead of re-rendering, we re-render would waste. So we re-render is not allowed here.
      // For simplicity, we store a placeholder in zip only when missing. (Worker can optimize later.)
      // Here: we intentionally skip re-reading from storage to avoid storage-specific APIs.
      // The zip is still generated from already-rendered buffers by using Puppeteer output buffers stored in memory would be ideal.
      // We'll re-render for zip creation to keep this function self-contained.
    });

    // Re-render buffers for the zip to avoid coupling to storage reads.
    for (let i = 0; i < slides.length; i++) {
      const slideHtml = slides[i];
      const n = i + 1;
      const buf = await puppeteerClient.screenshot({
        html: slideHtml,
        width,
        height: heightParam,
        format,
        quality,
        waitUntil: "networkidle0",
        scale: 2,
      });
      archive.append(buf, { name: `slide_${String(n).padStart(2, "0")}.${format === "jpg" ? "jpg" : "png"}` });
      totalSize += 0; // zip size accounted by buffer below
    }

    archive.finalize();
    const zipBuf = await zipPromise;

    const zipPath = `${storageBase}/carousel_export.zip`;
    zipUrl = await storage.upload(zipBuf, zipPath, "application/zip");
    const zipExport = await prisma.export.create({
      data: {
        designId,
        versionNumber: targetVersionNumber,
        format: "zip",
        fileUrl: zipUrl,
        fileSizeBytes: zipBuf.length,
      },
    });
    exportIds.push(zipExport.id);
    totalSize += zipBuf.length;
  }

  await prisma.design.update({
    where: { id: designId },
    data: { status: "exported" },
  });

  return {
    fileUrls,
    zipUrl,
    fileSizeBytes: totalSize,
    exportIds,
  };
}

