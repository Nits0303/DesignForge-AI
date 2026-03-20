import { prisma } from "@/lib/db/prisma";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { getStorageService } from "@/lib/storage";
import { puppeteerClient } from "@/lib/export/puppeteerClient";
import { parse } from "node-html-parser";

import type { ParsedIntent } from "@/types/ai";
import type { ExportFormat } from "@prisma/client";

function buildIntent(design: any): ParsedIntent {
  if (design.parsedIntent) return design.parsedIntent as ParsedIntent;
  return {
    platform: design.platform as any,
    format: design.format,
    dimensions: design.dimensions,
  };
}

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

function pickLandscape(platform: string, dims: { width: number; height: number }) {
  const p = platform.toLowerCase();
  if (p === "twitter" || p === "linkedin") return true;
  // Default: landscape if wider than tall
  return dims.width >= dims.height;
}

function composeSlidesForPdf(slides: string[]) {
  if (slides.length <= 1) return slides[0] ?? "";
  const head = parse(slides[0] ?? "").querySelector("head")?.toString() ?? "<head></head>";
  const bodies = slides.map((s) => {
    const doc = parse(s);
    return doc.querySelector("body")?.innerHTML ?? "";
  });

  const joined = bodies
    .map((b, idx) => {
      const pageBreak = idx < bodies.length - 1 ? `<div style="page-break-after:always"></div>` : "";
      return `<div>${b}</div>${pageBreak}`;
    })
    .join("");

  return `<!DOCTYPE html><html>${head}<body>${joined}</body></html>`;
}

export async function exportPDFDesign({
  designId,
  versionNumber,
  pageFormat = "A4",
  landscape,
}: {
  designId: string;
  versionNumber?: number | null;
  pageFormat?: "A4" | "A3" | "Letter";
  landscape?: boolean;
}): Promise<{ downloadUrl: string; exportId: string; fileSizeBytes: number }> {
  const design = await prisma.design.findFirst({
    where: { id: designId },
    include: { brand: true },
  });
  if (!design || !design.brand) throw new Error("Design/brand not found");

  const targetVersionNumber = versionNumber ?? design.currentVersion;
  const version = await prisma.designVersion.findUnique({
    where: { designId_versionNumber: { designId, versionNumber: targetVersionNumber } },
  });
  if (!version) throw new Error("Design version not found");

  const intent = buildIntent(design);

  const processed = await postProcessHtml({
    html: version.htmlContent,
    intent,
    brand: {
      name: (design.brand as any).name,
      typography: (design.brand as any).typography,
      colors: (design.brand as any).colors,
    },
  });

  const parsed = parseSlidesFromHtml(processed.html);
  const slides = parsed.slides.length ? parsed.slides : [processed.html];

  const dims = normaliseDims(design.dimensions);
  const width = dims.width;
  const heightParam: number | "auto" = ["website", "dashboard"].includes(design.platform.toLowerCase()) ? "auto" : dims.height;

  const htmlForPdf = composeSlidesForPdf(slides);

  const outPdf = await puppeteerClient.pdf({
    html: htmlForPdf,
    width,
    height: heightParam,
    pageFormat,
    landscape: typeof landscape === "boolean" ? landscape : pickLandscape(design.platform, dims),
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    waitUntil: "networkidle0",
  });

  const storage = getStorageService();
  const outPath = `exports/${designId}/${targetVersionNumber}/design.pdf`;
  const downloadUrl = await storage.upload(outPdf, outPath, "application/pdf");

  const exportRec = await prisma.export.create({
    data: {
      designId,
      versionNumber: targetVersionNumber,
      format: "pdf" as ExportFormat,
      fileUrl: downloadUrl,
      figmaUrl: null,
      fileSizeBytes: outPdf.length,
    } as any,
  });

  await prisma.design.update({
    where: { id: designId },
    data: { status: "exported" },
  });

  return { downloadUrl, exportId: exportRec.id, fileSizeBytes: outPdf.length };
}

