import { prisma } from "@/lib/db/prisma";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { getStorageService } from "@/lib/storage";
import { puppeteerClient } from "@/lib/export/puppeteerClient";

import type { ParsedIntent } from "@/types/ai";

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
    dimensions: design.dimensions,
  };
}

export async function exportDesignThumbnail({
  designId,
  versionNumber,
}: {
  designId: string;
  versionNumber?: number;
}): Promise<{ thumbnailUrl: string }> {
  const design = await prisma.design.findFirst({
    where: { id: designId },
    include: { brand: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!design || !design.brand) throw new Error("Design or brand not found");

  const targetVersionNumber = versionNumber ?? design.currentVersion;
  const version = await prisma.designVersion.findUnique({
    where: { designId_versionNumber: { designId, versionNumber: targetVersionNumber } },
  });

  if (!version) throw new Error("Design version not found");

  const intent = buildIntent({
    platform: design.platform,
    format: design.format,
    dimensions: design.dimensions,
    parsedIntent: design.parsedIntent,
  });

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
  const firstSlideHtml = parsed.slides[0] ?? processed.html;

  const buf = await puppeteerClient.thumbnail({ html: firstSlideHtml, waitUntil: "networkidle0" });
  const storage = getStorageService();
  const outPath = `exports/${designId}/thumbnail.png`;
  const thumbnailUrl = await storage.upload(buf, outPath, "image/png");

  await prisma.designAsset.create({
    data: {
      designId,
      versionNumber: targetVersionNumber,
      assetType: "preview",
      fileUrl: thumbnailUrl,
      sourceApi: "puppeteer",
      generationPrompt: null,
      costUsd: null,
    } as any,
  });

  return { thumbnailUrl };
}

