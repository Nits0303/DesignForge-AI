import type { ParsedIntent, PromptMetadata, MobileScreenDescriptor } from "@/types/ai";
import { PROMPTS } from "@/lib/ai/prompts";
import { brandProfileToXml } from "@/lib/ai/brandSerializer";
import { prisma } from "@/lib/db/prisma";
import { PLATFORM_SPECS } from "@/constants/platforms";
import type { ReferenceAnalysis } from "@/types/ai";
import { redis } from "@/lib/redis/client";
import { preferenceSerializer } from "@/lib/learning/preferenceSerializer";
import { buildMobileContextXml, buildMobileScreenFlowXml } from "@/lib/ai/mobilePromptBlocks";
import { resolvePromptVersionForGeneration } from "@/lib/ai/prompts/promptVersionRegistry";
import type { MergedAbPromptContext } from "@/lib/ab/abTestAssignment";
import { DEFAULT_SOCIAL_DIMENSION } from "@/constants/platforms";

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
  /** Base64-encoded reference images to send as vision inputs to the model. */
  referenceImageDataList?: { base64: string; mediaType: string }[];
  systemPromptVersionOverride?: string;
  /** Final resolved system prompt version key (DB default + A/B overrides). */
  resolvedSystemVersionKey?: string;
  abVariantContext?: MergedAbPromptContext;
  /** Per-screen flow generation (mobile multi-screen). */
  mobileGenerationContext?: {
    screenIndex: number;
    totalScreens: number;
    screenDescriptor?: MobileScreenDescriptor;
    previousScreensXml?: string;
  };
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
    `<CRITICAL_INSTRUCTION>This reference was provided for VISUAL STYLE INSPIRATION ONLY. You must NEVER copy any text, content, subject matter, company names, people's names, job titles, locations, or specific information from the reference image. The reference tells you HOW to design (colors, mood, layout style, visual approach). The user's prompt tells you WHAT to design (subject, content, message). These are separate. If you find yourself writing text that was in the reference image, STOP and replace it with content derived from the user's prompt instead.</CRITICAL_INSTRUCTION>`,
    `<layout confidence="${confidence.layout}">${phr(`${analysis.layoutStructure.type}; sections=${analysis.layoutStructure.sections.join(", ")}; density=${analysis.layoutStructure.contentDensity}; alignment=${analysis.layoutStructure.alignment}`, confidence.layout)}</layout>`,
    `<color_mood confidence="${confidence.color}">${analysis.colorPalette.paletteDescription}; ${analysis.colorPalette.isDark ? "dark" : "light"} theme; temperature=${analysis.colorPalette.colorTemperature}; saturation=${analysis.colorPalette.saturation}</color_mood>`,
    `<typography_style confidence="${confidence.typography}">The typography ${phr(`${analysis.typography.headingStyle} headings with ${analysis.typography.bodyStyle} body text`, confidence.typography)}; scale=${analysis.typography.sizeScale}; weight=${analysis.typography.weightStyle}</typography_style>`,
    `<spacing confidence="${confidence.spacing}">${phr(`density=${analysis.spacing.density}; sectionPadding=${analysis.spacing.sectionPadding}; componentSpacing=${analysis.spacing.componentSpacing}`, confidence.spacing)}</spacing>`,
    `<visual_style confidence="${confidence.visual}">mood=${analysis.visualStyle.mood}; keywords=${analysis.visualStyle.styleKeywords.join(", ")}; gradients=${analysis.visualStyle.hasGradients}; shadows=${analysis.visualStyle.hasShadows}; borderRadius=${analysis.visualStyle.borderRadius}</visual_style>`,
    `<components confidence="${confidence.components}">${phr(`${analysis.components.detected.join(", ")}; cta=${analysis.components.ctaStyle}; card=${analysis.components.cardStyle}; nav=${analysis.components.navigationStyle}`, confidence.components)}</components>`,
    `<inspiration_note>If the user asks to match, replicate, or keep the same background/layout as the reference (e.g. "only change the text", "same background"), reproduce that layout and visual structure closely in HTML/CSS, substituting the user's brand copy and logo. Otherwise use this analysis as loose inspiration while staying brand-consistent.</inspiration_note>`,
    `<confidence_overall>${confidenceLabel(analysis)}</confidence_overall>`,
  ].join("\n");
}

function trimSnippetForPrompt(html: string, maxChars = 1600): string {
  let out = String(html ?? "");
  // Remove HTML comments + collapse whitespace.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/\s+/g, " ").trim();
  if (!out) return "";

  // Strip non-structural Tailwind color-ish classes on long snippets to reduce tokens.
  // Keep layout classes like flex/grid/padding/margin/rounded/etc.
  if (out.length > maxChars) {
    out = out.replace(/class=["']([^"']+)["']/gi, (_m, cls) => {
      const kept = String(cls)
        .split(/\s+/)
        .filter(Boolean)
        .filter((c) => {
          if (/^(bg|text|border|ring|from|via|to|shadow|fill|stroke)-/i.test(c)) return false;
          if (/^(hover|focus|active):/i.test(c) && /(bg|text|border|ring|from|via|to|shadow)-/i.test(c)) return false;
          return true;
        })
        .slice(0, 70)
        .join(" ");
      return kept ? `class="${kept}"` : "";
    });
  }

  if (out.length > maxChars) out = `${out.slice(0, maxChars)}…`;
  return out;
}

export async function assembleGenerationPrompt({
  userId,
  brandId,
  intent,
  templates,
  userPrompt,
  referenceImageUrl,
  referenceAnalyses,
  referenceImageDataList,
  systemPromptVersionOverride,
  resolvedSystemVersionKey,
  abVariantContext,
  mobileGenerationContext,
}: AssembleParams): Promise<{
  system: string;
  messages: { role: "user"; content: ({ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } })[] }[];
  metadata: PromptMetadata;
}> {
  const brand = await prisma.brandProfile.findFirst({
    where: { id: brandId, userId },
  });

  const brandXmlFull = brand ? brandProfileToXml(brand as any) : "";
  let brandXml = brandXmlFull;
  if (abVariantContext?.brandContextLevel === "none") {
    brandXml = "";
  } else if (abVariantContext?.brandContextLevel === "colors_only" && brand) {
    const colors = brand.colors as Record<string, string> | null | undefined;
    brandXml = `<brand_colors_only>${JSON.stringify(colors ?? {})}</brand_colors_only>`;
  }

  const spec = PLATFORM_SPECS[intent.platform];
  const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0]! : intent.dimensions;

  const componentLines = templates
    .map(
      (t, idx) =>
        `<!-- component ${idx + 1} (${t.id}) tags: ${t.tags.join(", ")} -->\n${trimSnippetForPrompt(
          t.htmlSnippet.trim()
        )}`
    )
    .join("\n\n");

  const textParts: string[] = [];
  textParts.push(`INTENT:\n${JSON.stringify(intent, null, 2)}`);
  textParts.push(`PLATFORM SPEC:\n${spec.displayName} ${intent.format} ${dims.width}x${dims.height}`);

  // Social canvas dimensions selector (Square/Portrait/Landscape).
  const isSocial =
    intent.platform === "instagram" ||
    intent.platform === "linkedin" ||
    intent.platform === "facebook" ||
    intent.platform === "twitter";
  const selectedDim = isSocial && intent.format === "post" ? (intent.selectedDimension ?? DEFAULT_SOCIAL_DIMENSION) : null;
  const userPromptFinal =
    abVariantContext?.additionalInstruction && String(abVariantContext.additionalInstruction).trim()
      ? `${userPrompt}\n\n[A/B test variant note]\n${abVariantContext.additionalInstruction.trim()}`
      : userPrompt;

  const canvasReinforcement =
    selectedDim ? `\n\nCanvas: ${selectedDim.width}×${selectedDim.height}px (${selectedDim.id})` : "";
  textParts.push(`USER PROMPT:\n${userPromptFinal}${canvasReinforcement}`);
  textParts.push(
    `<content_instructions>\nEverything above this line defines WHAT to generate.\nEverything below this line defines the VISUAL STYLE to apply.\nThe content instructions take absolute priority.\nThe visual style instructions must never override the content.\n</content_instructions>`
  );

  if (brandXml) {
    textParts.push(`BRAND PROFILE XML:\n${brandXml}`);
  }

  // Learned user preferences (cached to avoid rebuilding XML every request).
  const prefCacheKey = `preferences:user:${userId}:prompt_block`;
  let preferencesXml = await redis.get(prefCacheKey);
  if (!preferencesXml) {
    const prefs = await prisma.userPreference.findMany({
      where: { userId, confidence: { gt: 0.6 } },
      select: { preferenceKey: true, preferenceValue: true, confidence: true, manualOverride: true },
      orderBy: { updatedAt: "desc" },
    });
    preferencesXml = preferenceSerializer(prefs as any);
    if (preferencesXml) {
      // TTL: slightly longer than the nightly batch cycle (25 hours).
      await redis.set(prefCacheKey, preferencesXml, "EX", 25 * 60 * 60);
    }
  }
  if (preferencesXml) {
    textParts.push(preferencesXml);
  }

  // Canvas dimensions block after content so the model applies constraints deterministically.
  if (selectedDim) {
    const dimCacheKey = `canvas_dimensions:user:${userId}`;
    let block = await redis.get(dimCacheKey);
    let cached = false;
    try {
      const existing = block ? JSON.parse(block) : null;
      if (existing?.id === selectedDim.id && typeof existing?.xml === "string") {
        block = existing.xml;
        cached = true;
      } else {
        block = null as any;
      }
    } catch {
      block = null as any;
    }

    if (!block) {
      block = `<canvas_dimensions>
  <width>${selectedDim.width}</width>
  <height>${selectedDim.height}</height>
  <ratio>${selectedDim.ratio}</ratio>
  <format>${selectedDim.id}</format>
  <instruction>
    Generate the design at exactly ${selectedDim.width}px wide by ${selectedDim.height}px tall.
    The root element must have inline style: width:${selectedDim.width}px; height:${selectedDim.height}px; overflow:hidden;
    Do not generate content that overflows these dimensions. All absolute positioning must respect these boundaries.
    Ensure the design fills the entire canvas — no white borders or empty areas at the edges.
  </instruction>
</canvas_dimensions>`;
      try {
        await redis.set(dimCacheKey, JSON.stringify({ id: selectedDim.id, xml: block }), "EX", 60 * 60 * 24);
      } catch {
        // ignore
      }
    }
    textParts.push(`CANVAS DIMENSIONS${cached ? " (cached)" : ""}:\n${block}`);
  }

  if (intent.platform === "mobile") {
    const colors = brand?.colors as Record<string, string> | null | undefined;
    const primary = colors?.primary ?? colors?.accent;
    textParts.push(buildMobileContextXml(intent, primary));
  }

  if (mobileGenerationContext) {
    textParts.push(
      buildMobileScreenFlowXml({
        screenIndex: mobileGenerationContext.screenIndex,
        totalScreens: mobileGenerationContext.totalScreens,
        descriptor: mobileGenerationContext.screenDescriptor,
        previousScreensXml: mobileGenerationContext.previousScreensXml,
      })
    );
  }

  if (templates.length) {
    textParts.push(`COMPONENT LIBRARY:\n${componentLines}`);
  } else {
    textParts.push(
      [
        "COMPONENT LIBRARY FALLBACK:",
        "No matching templates were retrieved for this request.",
        "You must still produce complete, structured, production-style HTML layout blocks (hero/content/cta/footer as applicable), not placeholder skeletons.",
      ].join("\n")
    );
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
    textParts.push(`REFERENCE ANALYSIS (STYLE ONLY — NEVER COPY CONTENT):\n${blocks.join("\n\n")}`);
    textParts.push(
      `REFERENCE CACHE HINT:\nEstimated cached-token-equivalent saving for this request: ${referenceCachedTokenEquivalent} tokens from ${referenceTokensEstimated} reference tokens.`
    );
  }

  textParts.push(
    [
      "OUTPUT CONTRACT:",
      "- Return only valid renderable HTML (no markdown/code fences).",
      "- Use utility-class styling suitable for Tailwind runtime in iframe preview.",
      "- Include clear visual structure and hierarchy with meaningful populated content.",
    ].join("\n")
  );

  const hasAttachedImages = Boolean(referenceImageDataList && referenceImageDataList.length > 0);
  const hasReferenceContext =
    Boolean(referenceImageUrl?.trim()) ||
    hasAttachedImages ||
    (referenceAnalyses?.length ?? 0) > 0;

  if (hasReferenceContext) {
    textParts.push(
      [
        hasAttachedImages
          ? "REFERENCE IMAGE INSTRUCTION (CRITICAL — pixel-accurate vision inputs attached):"
          : "REFERENCE INSTRUCTION (CRITICAL):",
        hasAttachedImages
          ? "Reference image(s) are attached for multimodal vision. Study the actual pixels and replicate:"
          : "Follow <reference_analysis> XML and any URL below. Replicate:",
        "- Background treatment (colors, gradients, shapes, patterns, curves)",
        "- Layout structure (split columns, centered, asymmetric, etc.)",
        "- Typography scale and weight hierarchy",
        "- Decorative elements (circles, blobs, curves, overlays, color accents)",
        "- Implement with a <style> block plus HTML (gradients, position:absolute shapes, border-radius, etc.)",
        "- Replace reference copy and in-reference logo with the user's content and brand logo; keep the same visual/structural design.",
        referenceImageUrl?.trim() ? `Reference image URL (for src if needed): ${referenceImageUrl.trim()}` : "",
      ].filter(Boolean).join("\n")
    );
  }

  if (hasAttachedImages) {
    textParts.push(
      "REFERENCE PRIMARY: Attached image(s) are authoritative when analysis text is weak or missing — copy composition, palette, and geometry from the image itself."
    );
  } else if ((referenceAnalyses?.length ?? 0) === 0 && referenceImageUrl?.trim()) {
    textParts.push(
      "REFERENCE FALLBACK INSTRUCTION:\nUse the reference URL as the visual guide. Replicate composition, palette, layout, and decorative shapes in CSS. Textual analysis may be unavailable."
    );
  }

  const userContent = textParts.join("\n\n---\n\n");

  const systemPromptVersion =
    resolvedSystemVersionKey ?? systemPromptVersionOverride ?? PROMPTS.generation.version;
  const system = (await resolvePromptVersionForGeneration(systemPromptVersion)).content;

  const metadata: PromptMetadata = {
    systemVersion: systemPromptVersion,
    estimatedTokens: {
      system: Math.round(system.length / 4),
      components: Math.round(componentLines.length / 4),
      brand: Math.round(brandXml.length / 4),
      preferences: preferencesXml ? Math.round(String(preferencesXml).length / 4) : 0,
      request: Math.round(userContent.length / 4),
    },
    templateIds: templates.map((t) => t.id),
    cacheLikely: templates.length > 0,
  };

  const contentBlocks: ({ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } })[] = [];

  contentBlocks.push({ type: "text", text: userContent });

  if (hasAttachedImages) {
    for (const img of referenceImageDataList!) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      });
    }
    contentBlocks.push({
      type: "text",
      text: "The image(s) above are the reference design(s) the user uploaded. Replicate their visual style closely while using the user's brand and text content.",
    });
  }

  return {
    system,
    messages: [
      {
        role: "user",
        content: contentBlocks,
      },
    ],
    metadata,
  };
}

