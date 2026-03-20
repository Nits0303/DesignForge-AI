import { PROMPTS } from "@/lib/ai/prompts";
import { REVISION_SYSTEM_PROMPT } from "@/lib/ai/prompts/revisionSystemPrompt";
import { brandProfileToXml } from "@/lib/ai/brandSerializer";
import { prisma } from "@/lib/db/prisma";
import { classifyRevision, type RevisionPattern } from "@/lib/ai/revisionClassifier";
import type { Messages } from "@anthropic-ai/sdk/resources";
import type { ReferenceAnalysis } from "@/types/ai";

type Args = {
  userId: string;
  designId: string;
  currentHtml: string;
  revisionText: string;
  slideIndex?: number | null;
  slideLabel?: "slide" | "screen";
  referenceImageUrl?: string | null;
  referenceAnalyses?: {
    referenceId: string;
    role?: "layout" | "style" | "color";
    analysis: ReferenceAnalysis;
  }[];
};

const CONTEXT_WINDOW_CHARS = 800_000; // approx 200k tokens × 4 chars/token
const BUDGET_THRESHOLD = 0.80; // 80%

function estimateChars(...parts: string[]): number {
  return parts.reduce((acc, p) => acc + p.length, 0);
}

function compressBrandXml(fullXml: string): string {
  // Extract only hex color codes and font names
  const colors: string[] = [];
  const fonts: string[] = [];
  const hexRe = /#[0-9a-fA-F]{3,8}/g;
  const fontRe = /font(?:-family)?[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(fullXml)) !== null) colors.push(m[0]);
  while ((m = fontRe.exec(fullXml)) !== null) fonts.push(m[1].trim());
  const uniqueColors = [...new Set(colors)];
  const uniqueFonts = [...new Set(fonts)];
  return `<brand_compressed>\n  <colors>${uniqueColors.join(", ")}</colors>\n  <fonts>${uniqueFonts.join(", ")}</fonts>\n</brand_compressed>`;
}

export async function assembleRevisionPrompt({
  userId,
  designId,
  currentHtml,
  revisionText,
  slideIndex,
  slideLabel,
  referenceImageUrl,
  referenceAnalyses,
}: Args): Promise<{
  system: string;
  messages: Messages.MessageParam[];
  pattern: RevisionPattern;
}> {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    include: { brand: true },
  });
  if (!design || !design.brand) {
    throw new Error("Design or brand not found for revision");
  }

  const pattern = classifyRevision(revisionText);

  let brandXml = brandProfileToXml(design.brand as any);
  const label = slideLabel ?? "slide";
  const containerLabel = label === "slide" ? "carousel" : "flow";
  const slidePrefix =
    typeof slideIndex === "number"
      ? `On ${label} ${slideIndex + 1} of the ${containerLabel}: `
      : "";

  const patternSummary = JSON.stringify({ type: pattern.type, ...(pattern as any) });

  const system = `${REVISION_SYSTEM_PROMPT}\n\n[system_version=${PROMPTS.revision?.version ?? "revision-v1"}]`;

  // ── Token budget check ───────────────────────────────────────────────────
  const baseChars = estimateChars(system, currentHtml, brandXml);
  const budgetChars = CONTEXT_WINDOW_CHARS * BUDGET_THRESHOLD;

  if (baseChars > budgetChars) {
    // Step 1: compress brand XML
    const compressedBrand = compressBrandXml(brandXml);
    console.warn(
      `[revisionPrompt] Context budget exceeded (${baseChars} chars > ${budgetChars}). ` +
        `Compressing brand XML from ${brandXml.length} to ${compressedBrand.length} chars.`
    );
    brandXml = compressedBrand;

    const afterCompress = estimateChars(system, currentHtml, brandXml);
    if (afterCompress > budgetChars) {
      // Step 2: drop brand entirely
      console.warn(
        `[revisionPrompt] Still over budget after brand compression (${afterCompress} chars). ` +
          `Dropping brand XML entirely.`
      );
      brandXml = "";
    }
  }

  const parts: string[] = [
    "<current_html>",
    currentHtml,
    "</current_html>",
    "",
    "<revision_request>",
    `${slidePrefix}${revisionText}`.trim(),
    "</revision_request>",
    "",
    "<revision_pattern>",
    patternSummary,
    "</revision_pattern>",
  ];

  if (brandXml) {
    parts.push("", brandXml);
  }

  if (referenceImageUrl) {
    parts.push(
      "",
      "<reference_image_note>",
      "The user has uploaded a reference image for style inspiration. Preserve the overall mood, color temperature, and layout density implied by this reference while applying the brand profile's specific colors and fonts.",
      "</reference_image_note>"
    );
  }

  if (referenceAnalyses && referenceAnalyses.length > 0) {
    for (const ref of referenceAnalyses.slice(0, 3)) {
      const roleAttr = ref.role ? ` role="${ref.role}"` : "";
      parts.push(
        "",
        `<reference_analysis${roleAttr}>`,
        `<layout>${ref.analysis.layoutStructure.type}; sections=${ref.analysis.layoutStructure.sections.join(", ")}</layout>`,
        `<color_mood>${ref.analysis.colorPalette.paletteDescription}</color_mood>`,
        `<visual_style>mood=${ref.analysis.visualStyle.mood}; keywords=${ref.analysis.visualStyle.styleKeywords.join(", ")}</visual_style>`,
        `<inspiration_note>Use as inspiration only. Keep output original and brand-consistent.</inspiration_note>`,
        `</reference_analysis>`
      );
    }
  }

  const body = parts.join("\n");

  const messages: Messages.MessageParam[] = [
    { role: "user", content: [{ type: "text", text: body }] },
  ];

  return { system, messages, pattern };
}
