import { prisma } from "@/lib/db/prisma";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { getStorageService } from "@/lib/storage";
import { sanitizeHtmlForIframe } from "@/lib/ai/htmlSanitizer.client";
import archiver from "archiver";
import { parse } from "node-html-parser";
import path from "path";

type CodeExportResult = {
  downloadUrl: string;
  exportId: string;
  fileSizeBytes: number;
};

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

function buildIntent(design: any) {
  if (design.parsedIntent) return design.parsedIntent;
  return {
    platform: design.platform,
    format: design.format,
    dimensions: design.dimensions,
  };
}

function stripCdnRefs(html: string) {
  let out = html;
  // Tailwind CDN script
  out = out.replace(
    /<script[^>]*src="https:\/\/cdn\.tailwindcss\.com[^"]*"[^>]*><\/script>/gi,
    "<!-- Tailwind CDN script removed for local export. Include Tailwind v4 per docs. -->"
  );
  out = out.replace(
    /<script[^>]*src="https:\/\/cdn\.tailwindcss\.com[^"]*"[^\/>]*\/?>/gi,
    "<!-- Tailwind CDN script removed for local export. Include Tailwind v4 per docs. -->"
  );
  // Google fonts
  out = out.replace(
    /<link[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"[^>]*>/gi,
    "<!-- Google Fonts link removed for local export. Include the font import in your own project. -->"
  );
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  } finally {
    clearTimeout(t);
  }
}

export async function exportCodeZip({
  designId,
  versionNumber,
}: {
  designId: string;
  versionNumber?: number | null;
}): Promise<CodeExportResult> {
  const design = await prisma.design.findUnique({
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

  const isWebOrDash = design.platform === "website" || design.platform === "dashboard";
  const processedDoc = parse(processed.html);
  const sectionNodes = isWebOrDash
    ? processedDoc.querySelectorAll('section[data-section-type]')
    : [];

  const websiteSectionsForArchive =
    isWebOrDash && sectionNodes.length > 0
      ? sectionNodes.map((n) => {
          const t = n.getAttribute("data-section-type") ?? "section";
          return { type: t, html: n.toString() };
        })
      : [];

  const slidesParsed = parseSlidesFromHtml(processed.html);
  const slides = slidesParsed.slides.length ? slidesParsed.slides : [processed.html];

  // Build a combined index.html when exporting multi-slide designs.
  const baseDoc = parse(slides[0] ?? processed.html);
  const head = baseDoc.querySelector("head")?.toString() ?? "<head></head>";

  let bodyContent = "";
  let indexJs = "";

  // For website/dashboard multi-sections, also split into `sections/*.html` inside the zip.
  if (websiteSectionsForArchive.length > 0) {
    bodyContent = websiteSectionsForArchive.map((s) => s.html).join("\n");
  } else if (slides.length > 1) {
    const sections = slides
      .map((slideHtml, idx) => {
        const doc = parse(slideHtml);
        const inner = doc.querySelector("body")?.innerHTML ?? "";
        const isFirst = idx === 0;
        return `<section id="slide-${idx + 1}" style="display:${isFirst ? "block" : "none"}">${inner}</section>`;
      })
      .join("");

    indexJs = `
<script>
  const sections = Array.from(document.querySelectorAll('section[id^="slide-"]'));
  function showFromHash() {
    const raw = location.hash ? location.hash.replace('#','') : 'slide-1';
    sections.forEach((s) => {
      s.style.display = s.id === raw ? 'block' : 'none';
    });
  }
  window.addEventListener('hashchange', showFromHash);
  showFromHash();
</script>`;

    bodyContent = sections + indexJs;
  } else {
    const doc = parse(slides[0] ?? processed.html);
    bodyContent = doc.querySelector("body")?.innerHTML ?? "";
  }

  let indexHtml = `<!-- Generated by DesignForge AI — designforge.ai -->\n<!DOCTYPE html>\n<html>\n${head}\n<body>\n${bodyContent}\n</body>\n</html>`;

  indexHtml = stripCdnRefs(indexHtml);

  // Download up to 20 non-placeholder images and rewrite <img> src to local assets/
  const doc = parse(indexHtml);
  const imgs = doc.querySelectorAll("img");
  const assetsToDownload: Array<{ el: any; src: string; ext: string; filename: string }> = [];

  for (const img of imgs) {
    const src = (img.getAttribute("src") ?? "").trim();
    if (!src) continue;
    if (src.startsWith("data:")) continue;
    const dataPlaceholder = img.getAttribute("data-placeholder");
    if (dataPlaceholder === "true") continue;
    if (src.includes("placeholder.designforge.ai")) continue;

    const extFromUrl = (() => {
      const ext = path.extname(src).replace(".", "").toLowerCase();
      if (ext === "jpeg") return "jpg";
      if (!ext) return "png";
      return ext;
    })();

    const filename = `asset_${assetsToDownload.length + 1}.${extFromUrl}`;
    assetsToDownload.push({ el: img, src, ext: extFromUrl, filename });
    if (assetsToDownload.length >= 20) break;
  }

  const downloadedAssets = new Map<string, Buffer>();
  for (const a of assetsToDownload) {
    try {
      const buf = await fetchWithTimeout(a.src, 10_000);
      downloadedAssets.set(a.filename, buf);
      a.el.setAttribute("src", `assets/${a.filename}`);
    } catch {
      // leave src as-is if it can't be fetched
    }
  }

  // Rewrite updated HTML back into string
  indexHtml = doc.toString();

  const brandName = design.brand.name || "Design";
  const platform = design.platform || "platform";
  const format = design.format || "format";
  const createdAt = design.createdAt ? new Date(design.createdAt).toISOString() : new Date().toISOString();
  const referenceIds = (design as any).referenceIds as string[] | undefined;
  let inspirationSection = "";
  if (referenceIds && referenceIds.length > 0) {
    const ref = await prisma.referenceImage.findFirst({
      where: { id: { in: referenceIds } },
      select: { analysisJson: true },
    });
    const description =
      (ref?.analysisJson as any)?.overallDescription ??
      "Reference analysis was used to guide mood, spacing, and structure.";
    inspirationSection = `
## Design Inspiration
This design was generated with visual inspiration from a reference image. The reference is not reproduced in this design — it was used only as a stylistic guide.

Reference summary: ${description}
`;
  }

  const readme = `# ${brandName} — ${platform} (${format})

Generated by DesignForge AI.

## How to view locally
- Open \`index.html\` in a browser.

## Fonts & Tailwind
This export removed external CDN references.
- Tailwind CSS: include it using Tailwind v4 CDN or your own build (see https://tailwindcss.com/docs).
- Fonts: include Google Fonts imports for the fonts used by the design.

## Editing
- Edit \`index.html\` and local assets under \`assets/\`.
${inspirationSection}
`;

  const tailwindNote = `This design uses Tailwind CSS v4 via CDN mode in the original generator.

For production usage, follow the Tailwind CSS v4 installation guide:
https://tailwindcss.com/docs/installation
`;

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  const zipPromise = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (d: any) => chunks.push(Buffer.from(d)));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });

  archive.append(indexHtml, { name: "index.html" });
  archive.append(readme, { name: "README.md" });
  archive.append(tailwindNote, { name: "tailwind-config-note.txt" });

  for (const s of websiteSectionsForArchive) {
    archive.append(s.html, { name: `sections/${s.type}.html` });
  }

  for (const [filename, buf] of downloadedAssets.entries()) {
    archive.append(buf, { name: `assets/${filename}` });
  }

  archive.finalize();
  const zipBuf = await zipPromise;

  const storage = getStorageService();
  const outPath = `exports/${designId}/${targetVersionNumber}/code_export.zip`;
  const downloadUrl = await storage.upload(zipBuf, outPath, "application/zip");

  const exportRec = await prisma.export.create({
    data: {
      designId,
      versionNumber: targetVersionNumber,
      format: "html_css",
      fileUrl: downloadUrl,
      figmaUrl: null,
      fileSizeBytes: zipBuf.length,
    } as any,
  });

  await prisma.design.update({
    where: { id: designId },
    data: { status: "exported" },
  });

  return { downloadUrl, exportId: exportRec.id, fileSizeBytes: zipBuf.length };
}

