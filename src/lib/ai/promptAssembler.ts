import type { ParsedIntent, PromptMetadata } from "@/types/ai";
import { PROMPTS } from "@/lib/ai/prompts";
import { brandProfileToXml } from "@/lib/ai/brandSerializer";
import { prisma } from "@/lib/db/prisma";
import { PLATFORM_SPECS } from "@/constants/platforms";
import type { ReferenceAnalysis } from "@/types/ai";
import { redis } from "@/lib/redis/client";

type AssembleParams = {
  userId: string;
  brandId: string;
  intent: ParsedIntent;
  templates: { id: string; htmlSnippet: string; tags: string[] }[];
  userPrompt: string;
  referenceImageUrl?: string | null;
  referenceAnalyses?: {
    referenceId: string;
    role?: "layout" | "style" | "color";
    analysis: ReferenceAnalysis;
  }[];
};

function confidenceLabel(a: ReferenceAnalysis) {
  const n = a.visualStyle?.styleKeywords?.length ?? 0;
  if (n >= 5) return "high";
  if (n >= 3) return "medium";
  return "low";
}

function fieldConfidence(analysis: ReferenceAnalysis) {
  const base = confidenceLabel(analysis);
  return {
    layout: base === "high" ? "medium" : "low",
    color: "high",
    typography: base === "high" ? "medium" : "low",
    spacing: base === "high" ? "medium" : "low",
    visual: base,
    components: base === "high" ? "medium" : "low",
  } as const;
}

function buildReferenceXml(analysis: ReferenceAnalysis) {
  const confidence = fieldConfidence(analysis);
  const phr = (s: string, c: "low" | "medium" | "high") =>
    c === "low" ? `appears to ${s}` : c === "medium" ? `likely ${s}` : s;
  return [
    `<layout confidence="${confidence.layout}">${phr(`${analysis.layoutStructure.type}; sections=${analysis.layoutStructure.sections.join(", ")}; density=${analysis.layoutStructure.contentDensity}; alignment=${analysis.layoutStructure.alignment}`, confidence.layout)}</layout>`,
    `<color_mood confidence="${confidence.color}">${analysis.colorPalette.paletteDescription}; ${analysis.colorPalette.isDark ? "dark" : "light"} theme; temperature=${analysis.colorPalette.colorTemperature}; saturation=${analysis.colorPalette.saturation}</color_mood>`,
    `<typography_style confidence="${confidence.typography}">The typography ${phr(`${analysis.typography.headingStyle} headings with ${analysis.typography.bodyStyle} body text`, confidence.typography)}; scale=${analysis.typography.sizeScale}; weight=${analysis.typography.weightStyle}</typography_style>`,
    `<spacing confidence="${confidence.spacing}">${phr(`density=${analysis.spacing.density}; sectionPadding=${analysis.spacing.sectionPadding}; componentSpacing=${analysis.spacing.componentSpacing}`, confidence.spacing)}</spacing>`,
    `<visual_style confidence="${confidence.visual}">mood=${analysis.visualStyle.mood}; keywords=${analysis.visualStyle.styleKeywords.join(", ")}; gradients=${analysis.visualStyle.hasGradients}; shadows=${analysis.visualStyle.hasShadows}; borderRadius=${analysis.visualStyle.borderRadius}</visual_style>`,
    `<components confidence="${confidence.components}">${phr(`${analysis.components.detected.join(", ")}; cta=${analysis.components.ctaStyle}; card=${analysis.components.cardStyle}; nav=${analysis.components.navigationStyle}`, confidence.components)}</components>`,
    `<inspiration_note>Use the above characteristics as stylistic inspiration only. Apply the user's brand colors, fonts, and content — do not reproduce the reference design's content or exact layout.</inspiration_note>`,
    `<confidence_overall>${confidenceLabel(analysis)}</confidence_overall>`,
  ].join("\n");
}

export async function assembleGenerationPrompt({
  userId,
  brandId,
  intent,
  templates,
  userPrompt,
  referenceImageUrl,
  referenceAnalyses,
}: AssembleParams): Promise<{
  system: string;
  messages: { role: "user"; content: { type: "text"; text: string }[] }[];
  metadata: PromptMetadata;
}> {
  const brand = await prisma.brandProfile.findFirst({
    where: { id: brandId, userId },
  });

  const brandXml = brand ? brandProfileToXml(brand as any) : "";

  const spec = PLATFORM_SPECS[intent.platform];
  const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0]! : intent.dimensions;

  const componentLines = templates
    .map(
      (t, idx) =>
        `<!-- component ${idx + 1} (${t.id}) tags: ${t.tags.join(", ")} -->\n${t.htmlSnippet.trim()}`
    )
    .join("\n\n");

  const textParts: string[] = [];
  textParts.push(`INTENT:\n${JSON.stringify(intent, null, 2)}`);
  textParts.push(
    `PLATFORM SPEC:\n${spec.displayName} ${intent.format} ${dims.width}x${dims.height}`
  );
  if (brandXml) {
    textParts.push(`BRAND PROFILE XML:\n${brandXml}`);
  }
  if (templates.length) {
    textParts.push(`COMPONENT LIBRARY:\n${componentLines}`);
  }

  if (referenceAnalyses && referenceAnalyses.length > 0) {
    const blocks: string[] = [];
    let referenceTokensEstimated = 0;
    let referenceCachedTokenEquivalent = 0;
    for (const ref of referenceAnalyses.slice(0, 3)) {
      const cacheKey = `reference:prompt_block:${ref.referenceId}`;
      const cached = await redis.get(cacheKey);
      const xmlBody = cached || buildReferenceXml(ref.analysis);
      if (!cached) {
        await redis.set(cacheKey, xmlBody, "EX", 60 * 60 * 24);
      }
      const roleAttr = ref.role ? ` role="${ref.role}"` : "";
      blocks.push(`<reference_analysis${roleAttr}>\n${xmlBody}\n</reference_analysis>`);
      const t = Math.round(xmlBody.length / 4);
      referenceTokensEstimated += t;
      if (cached) referenceCachedTokenEquivalent += Math.round(t * 0.9);
    }
    if (blocks.length > 1) {
      blocks.push(
        `Multiple references are provided. Use each reference only for its specified role — the layout reference informs structure, the style reference informs visual mood, and the color reference informs palette direction while still applying the brand's specific hex codes.`
      );
    }
    textParts.push(`REFERENCE ANALYSIS:\n${blocks.join("\n\n")}`);
    textParts.push(
      `REFERENCE CACHE HINT:\nEstimated cached-token-equivalent saving for this request: ${referenceCachedTokenEquivalent} tokens from ${referenceTokensEstimated} reference tokens.`
    );
  }

  textParts.push(`USER PROMPT:\n${userPrompt}`);

  if (referenceImageUrl) {
    textParts.push(
      "REFERENCE IMAGE NOTE:\nThe user has uploaded a reference image for style inspiration. Incorporate the overall mood, color temperature, and layout density of the reference into the generated design while applying the brand profile's specific colors and fonts."
    );
  }

  const userContent = textParts.join("\n\n---\n\n");

  const system = PROMPTS.generation.system;

  const metadata: PromptMetadata = {
    systemVersion: PROMPTS.generation.version,
    estimatedTokens: {
      system: Math.round(system.length / 4),
      components: Math.round(componentLines.length / 4),
      brand: Math.round(brandXml.length / 4),
      preferences: 0,
      request: Math.round(userContent.length / 4),
    },
    templateIds: templates.map((t) => t.id),
    cacheLikely: templates.length > 0,
  };

  return {
    system,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: userContent }],
      },
    ],
    metadata,
  };
}

