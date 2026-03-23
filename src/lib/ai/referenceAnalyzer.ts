import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { AI_MODELS } from "@/constants/models";
import { PROMPTS } from "@/lib/ai/prompts";
import type { ReferenceAnalysis } from "@/types/ai";

const analysisSchema = z.object({
  layoutStructure: z.object({
    type: z.enum([
      "single_column",
      "two_column",
      "three_column",
      "grid",
      "hero_split",
      "sidebar",
      "card_grid",
      "full_bleed",
    ]),
    sections: z.array(z.string()),
    hasNavbar: z.boolean(),
    hasSidebar: z.boolean(),
    hasHero: z.boolean(),
    contentDensity: z.enum(["sparse", "moderate", "dense"]),
    alignment: z.enum(["left", "center", "mixed"]),
  }),
  colorPalette: z.object({
    dominant: z.string(),
    background: z.string(),
    text: z.string(),
    accent: z.string(),
    isDark: z.boolean(),
    colorTemperature: z.enum(["warm", "cool", "neutral"]),
    saturation: z.enum(["muted", "moderate", "vibrant"]),
    paletteDescription: z.string(),
  }),
  typography: z.object({
    headingStyle: z.enum(["serif", "sans-serif", "display", "monospace"]),
    bodyStyle: z.enum(["serif", "sans-serif"]),
    sizeScale: z.enum(["compact", "comfortable", "large"]),
    weightStyle: z.enum(["light", "regular", "bold", "mixed"]),
    typographyDescription: z.string(),
  }),
  spacing: z.object({
    density: z.enum(["tight", "comfortable", "spacious"]),
    sectionPadding: z.enum(["minimal", "moderate", "generous"]),
    componentSpacing: z.enum(["tight", "balanced", "airy"]),
  }),
  visualStyle: z.object({
    mood: z.enum(["minimal", "bold", "playful", "corporate", "elegant", "technical", "warm", "futuristic"]),
    hasGradients: z.boolean(),
    hasShadows: z.boolean(),
    hasIllustrations: z.boolean(),
    hasPhotography: z.boolean(),
    borderRadius: z.enum(["sharp", "slight", "rounded", "pill"]),
    hasPatterns: z.boolean(),
    styleKeywords: z.array(z.string()),
  }),
  components: z.object({
    detected: z.array(z.string()),
    ctaStyle: z.enum(["button", "link", "banner", "form", "none"]),
    cardStyle: z.enum(["flat", "bordered", "shadowed", "glassmorphism", "none"]),
    navigationStyle: z.enum(["horizontal_top", "vertical_sidebar", "hamburger", "tabs", "none"]),
  }),
  platform: z.object({
    detectedType: z.enum(["website", "mobile_app", "dashboard", "social_media", "email", "unknown"]),
    suggestedShortcode: z.string(),
  }),
  overallDescription: z.string(),
  contentRejected: z.boolean().optional(),
});

function isRefusal(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("i can’t help with that") ||
    lower.includes("i can't help with that") ||
    lower.includes("i’m unable to") ||
    lower.includes("i am unable to") ||
    lower.includes("cannot assist with")
  );
}

function parseStoragePathFromPublicUrl(fileUrl: string) {
  const marker = "/api/files/";
  const idx = fileUrl.indexOf(marker);
  if (idx < 0) return null;
  return fileUrl.slice(idx + marker.length);
}

async function readImageFromStorageUrl(fileUrl: string): Promise<Buffer> {
  const storagePath = parseStoragePathFromPublicUrl(fileUrl);
  if (!storagePath) throw new Error("Invalid storage URL");
  const baseDir = process.env.LOCAL_STORAGE_PATH ?? "./storage";
  const fullPath = join(/* turbopackIgnore: true */ process.cwd(), baseDir, storagePath);
  return readFile(fullPath);
}

function ensureHex(v: string) {
  return /^#[0-9a-f]{6}$/i.test(v);
}

async function sharpDominantFallback(buf: Buffer) {
  const stats = await sharp(buf).stats();
  const dom = stats.dominant;
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  const hex = `#${toHex(dom.r)}${toHex(dom.g)}${toHex(dom.b)}`;
  return hex;
}

function addDefaults(raw: any): ReferenceAnalysis {
  const temp = raw?.colorPalette?.colorTemperature ?? (raw?.colorPalette?.isDark ? "cool" : "neutral");
  return {
    ...raw,
    colorPalette: {
      ...(raw?.colorPalette ?? {}),
      colorTemperature: temp,
      saturation: raw?.colorPalette?.saturation ?? "moderate",
    },
    visualStyle: {
      ...(raw?.visualStyle ?? {}),
      styleKeywords: Array.isArray(raw?.visualStyle?.styleKeywords) ? raw.visualStyle.styleKeywords : [],
    },
    analyzedAt: new Date().toISOString(),
  };
}

export async function analyzeReferenceImage({
  referenceId,
  userId,
  forceFresh = false,
}: {
  referenceId: string;
  userId: string;
  forceFresh?: boolean;
}): Promise<ReferenceAnalysis | null> {
  const cacheKey = `reference:analysis:${referenceId}`;
  if (!forceFresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as ReferenceAnalysis;
      return { ...parsed, fromCache: true };
    }
  }

  const reference = await prisma.referenceImage.findFirst({
    where: { id: referenceId, userId },
  });
  if (!reference) return null;

  if (!forceFresh && reference.analysisJson) {
    const persisted = reference.analysisJson as ReferenceAnalysis;
    await redis.set(cacheKey, JSON.stringify(persisted), "EX", 60 * 60 * 24);
    return { ...persisted, fromCache: true };
  }

  const imgBuf = await readImageFromStorageUrl(reference.visionUrl);
  const mediaType = "image/jpeg";
  const b64 = imgBuf.toString("base64");

  const perform = async (retry: boolean) =>
    callAnthropicWithRetry(
      {
        model: AI_MODELS.GENERATOR_SONNET,
        max_tokens: 2500,
        system: retry
          ? `${PROMPTS.referenceAnalysis.system}\n\nYou must return only valid JSON. Your previous response was not valid JSON. Try again.`
          : PROMPTS.referenceAnalysis.system,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this design reference image for inspiration characteristics." },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: b64,
                },
              } as any,
            ],
          },
        ],
      } as any,
      { userId }
    );

  let rawText = "";
  let parsed: any = null;
  for (let i = 0; i < 2; i++) {
    const res = await perform(i === 1);
    rawText = res.content?.[0]?.type === "text" ? res.content[0].text.trim() : "";
    if (isRefusal(rawText)) {
      const rejected = { contentRejected: true } as ReferenceAnalysis;
      await prisma.referenceImage.update({
        where: { id: referenceId },
        data: { contentRejected: true, analysisJson: rejected as any },
      });
      return rejected;
    }
    try {
      parsed = JSON.parse(rawText);
      break;
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    console.error("[referenceAnalyzer] Invalid JSON", rawText);
    return null;
  }

  let withDefaults = addDefaults(parsed);

  const validated = analysisSchema.safeParse(withDefaults);
  if (!validated.success) {
    withDefaults = addDefaults(parsed);
  } else {
    withDefaults = validated.data as ReferenceAnalysis;
  }

  // Fallback for invalid hex colors.
  const dominantFallback = await sharpDominantFallback(imgBuf);
  if (!ensureHex(withDefaults.colorPalette.dominant)) {
    withDefaults.colorPalette.dominant = dominantFallback;
  }
  if (!ensureHex(withDefaults.colorPalette.background)) {
    withDefaults.colorPalette.background = dominantFallback;
  }
  if (!ensureHex(withDefaults.colorPalette.text)) {
    withDefaults.colorPalette.text = withDefaults.colorPalette.isDark ? "#F8FAFC" : "#0F172A";
  }
  if (!ensureHex(withDefaults.colorPalette.accent)) {
    withDefaults.colorPalette.accent = withDefaults.colorPalette.dominant;
  }

  await prisma.referenceImage.update({
    where: { id: referenceId },
    data: { analysisJson: withDefaults as any, contentRejected: false },
  });
  await redis.set(cacheKey, JSON.stringify(withDefaults), "EX", 60 * 60 * 24);
  return withDefaults;
}

export async function getReferenceAnalysis(referenceId: string): Promise<ReferenceAnalysis | null> {
  const cacheKey = `reference:analysis:${referenceId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as ReferenceAnalysis;
  const ref = await prisma.referenceImage.findUnique({ where: { id: referenceId } });
  if (!ref?.analysisJson) return null;
  const analysis = ref.analysisJson as ReferenceAnalysis;
  await redis.set(cacheKey, JSON.stringify(analysis), "EX", 60 * 60 * 24);
  return analysis;
}

