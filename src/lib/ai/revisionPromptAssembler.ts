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
  /** Multimodal vision inputs (same as generation). */
  referenceImageDataList?: { base64: string; mediaType: string }[];
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

function requestsSocialIcons(text: string): boolean {
  return /\bsocial\s*icons?\b|\bicons?\b.*\b(twitter|x|linkedin|instagram|facebook)\b/i.test(text);
}

function requestsWebsiteUrl(text: string): boolean {
  return /\bwebsite\s*url\b|\bwebsite\s*link\b|\badd\s+(?:a\s+)?(?:url|link)\b|\bfooter\b.*\b(url|link)\b/i.test(text);
}

function requestsLogoAtTop(text: string): boolean {
  return /\blogo\b.*\b(top|header|first)\b|\b(top|header|first)\b.*\blogo\b/i.test(text);
}

function extractUrlFromText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/i);
  if (!m) return null;
  const raw = m[0].trim().replace(/[),.;!?]+$/, "");
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function pickWebsiteFromSocialHandles(raw: unknown): string | null {
  if (!raw) return null;
  const candidates: string[] = [];
  if (typeof raw === "string") {
    candidates.push(raw);
  } else if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string") candidates.push(v);
    }
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (/website|site|url|link/i.test(k)) candidates.unshift(v);
        else candidates.push(v);
      }
    }
  }
  for (const c of candidates) {
    const extracted = extractUrlFromText(c);
    if (extracted) return extracted;
  }
  return null;
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
  referenceImageDataList,
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
  const wantsSocialIcons = requestsSocialIcons(revisionText);
  const wantsWebsiteUrl = requestsWebsiteUrl(revisionText);
  const wantsLogoTop = requestsLogoAtTop(revisionText);
  const explicitUrl = extractUrlFromText(revisionText);
  const fallbackBrandUrl = pickWebsiteFromSocialHandles((design.brand as any).socialHandles);
  const resolvedFooterUrl = explicitUrl ?? fallbackBrandUrl ?? "https://www.yourwebsite.com";

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
        `<inspiration_note>If the user asks to match the reference layout/background, replicate it closely; otherwise use as loose inspiration and stay brand-consistent.</inspiration_note>`,
        `</reference_analysis>`
      );
    }
  }

  if (wantsSocialIcons || wantsWebsiteUrl || wantsLogoTop) {
    parts.push("", "<revision_requirements>");
    if (wantsLogoTop) {
      parts.push(
        "- Move logo/company mark to the top as the first visible element. Nothing should appear above it."
      );
    }
    if (wantsSocialIcons) {
      parts.push(
        "- Include a bottom footer row with horizontal social icon links for requested platforms (Twitter/X, LinkedIn, Instagram, Facebook)."
      );
    }
    if (wantsWebsiteUrl) {
      parts.push(
        `- Include a styled footer website link using <a href="${resolvedFooterUrl}">${resolvedFooterUrl}</a>.`
      );
    }
    parts.push("</revision_requirements>");
  }

  if (wantsSocialIcons) {
    const socialFooterTemplate = await prisma.template.findFirst({
      where: {
        isActive: true,
        submissionStatus: "approved",
        category: "footer",
        tags: { has: "social-icons" },
        OR: [{ platform: design.platform }, { platform: "all" }],
      },
      orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
      select: { htmlSnippet: true, name: true, platform: true },
    });
    if (socialFooterTemplate?.htmlSnippet) {
      parts.push(
        "",
        `<reference_component type="social_icons_footer" source="${socialFooterTemplate.name}" platform="${socialFooterTemplate.platform}">`,
        socialFooterTemplate.htmlSnippet,
        "</reference_component>",
        "<reference_component_note>Use this as a structural pattern for footer social icons; adapt styling to current design.</reference_component_note>"
      );
    }
  }

  const body = parts.join("\n");

  const hasVision = Boolean(referenceImageDataList && referenceImageDataList.length > 0);
  const contentBlocks: Messages.MessageParam["content"] = [{ type: "text", text: body }];

  if (hasVision) {
    for (const img of referenceImageDataList!) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      } as any);
    }
    contentBlocks.push({
      type: "text",
      text: "The image(s) above are the user's reference design(s). Honor their layout and style when applying the revision.",
    } as any);
  }

  const messages: Messages.MessageParam[] = [{ role: "user", content: contentBlocks as any }];

  return { system, messages, pattern };
}
