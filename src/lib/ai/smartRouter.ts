import type { ParsedIntent } from "@/types/ai";
import type { Platform } from "@/types/design";
import {
  DEFAULT_SOCIAL_DIMENSION,
  SOCIAL_DIMENSIONS,
  type SocialDimensionId,
  type SocialDimensionPreset,
  PLATFORM_SPECS,
} from "@/constants/platforms";
import { AI_MODELS } from "@/constants/models";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { PROMPTS } from "@/lib/ai/prompts";
import { startTraceRun, type TraceContext } from "@/lib/server/langsmith";

function safeParseJSON(raw: string) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

type SmartRouterParams = {
  userId: string;
  prompt: string;
  partialIntent: Partial<ParsedIntent>;
  trace?: TraceContext;
  parentRunId?: string;
};

function isSocialPlatform(p: string): p is Platform {
  return ["instagram", "linkedin", "facebook", "twitter"].includes(String(p).toLowerCase());
}

function inferSocialDimensionIdFromText(text: string): SocialDimensionId | null {
  const t = String(text ?? "").toLowerCase();
  if (/\b(square|1:1)\b/.test(t)) return "square";
  if (/\b(portrait|vertical|4:5)\b/.test(t)) return "portrait";
  if (/\b(landscape|horizontal|wide|16:9)\b/.test(t)) return "landscape";
  return null;
}

function getSocialPresetById(id: SocialDimensionId | null | undefined): SocialDimensionPreset | null {
  if (!id) return null;
  return (SOCIAL_DIMENSIONS.find((d) => d.id === id) as SocialDimensionPreset | undefined) ?? null;
}

function clampDimensions(
  platform: Platform,
  format: string,
  dims:
    | { width: number; height: number | "auto" }
    | { width: number; height: number | "auto" }[]
) {
  const spec = PLATFORM_SPECS[platform];
  const fallback = spec.defaultDimensions[format] ?? Object.values(spec.defaultDimensions)[0];

  const cap = (d: { width: number; height: number | "auto" }) => {
    const w = Math.max(100, Math.min(4096, d.width || fallback.width));
    if (d.height === "auto") return { width: w, height: "auto" as const };
    const hNum = typeof d.height === "number" ? d.height : fallback.height;
    const h = Math.max(100, Math.min(4096, Number(hNum)));
    return { width: w, height: h as number };
  };

  if (Array.isArray(dims)) return dims.map(cap);
  return cap(dims);
}

export async function smartRouteIntent({
  userId,
  prompt,
  partialIntent,
  trace,
  parentRunId,
}: SmartRouterParams): Promise<ParsedIntent> {
  const initialPlatform = (partialIntent.platform ?? "instagram") as Platform;
  const initialFormat =
    typeof partialIntent.format === "string"
      ? String(partialIntent.format).toLowerCase().replace(/\s+/g, "_")
      : PLATFORM_SPECS[initialPlatform].supportedFormats[0];

  // If the workspace provided an explicit social dimension preset, apply it early.
  const explicitSelected = (partialIntent.selectedDimension ?? null) as SocialDimensionPreset | null;
  const explicitSelectedDims =
    explicitSelected && isSocialPlatform(initialPlatform) && initialFormat === "post"
      ? { width: explicitSelected.width, height: explicitSelected.height }
      : null;

  const defaultDims =
    explicitSelectedDims ??
    partialIntent.dimensions ??
    PLATFORM_SPECS[initialPlatform].defaultDimensions[initialFormat] ??
    Object.values(PLATFORM_SPECS[initialPlatform].defaultDimensions)[0];

  const messages = [
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: `User prompt:\n${prompt}\n\nExisting hints:\n${JSON.stringify(partialIntent)}`,
        },
      ],
    },
  ];

  const run = await startTraceRun({
    name: "smart_router_intent",
    runType: "llm",
    inputs: {
      prompt,
      partialIntent,
    },
    tags: ["router", "intent"],
    trace,
    parentRunId,
  });

  const res = await callAnthropicWithRetry(
    {
      model: AI_MODELS.ROUTER_HAIKU,
      system: PROMPTS.smartRouter.system,
      max_tokens: 512,
      messages,
    },
    {
      userId,
      trace: {
        ...(trace ?? {}),
        stage: "smart_router",
      },
      parentRunId: run?.id ?? parentRunId,
    }
  );
  await run?.finish({
    outputs: {
      model: res.model,
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    },
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  let parsed: ParsedIntent | null = null;
  try {
    parsed = safeParseJSON(text) as ParsedIntent;
  } catch {
    parsed = null;
  }

  const parsedAny = parsed as any;

  const resolvedPlatform = (partialIntent.platform ?? parsedAny?.platform ?? initialPlatform) as Platform;
  const resolvedSpec = PLATFORM_SPECS[resolvedPlatform];

  const parsedFormatCandidate =
    typeof parsedAny?.format === "string" ? String(parsedAny.format).toLowerCase().replace(/\s+/g, "_") : undefined;
  const resolvedFormatCandidate =
    typeof partialIntent.format === "string"
      ? String(partialIntent.format).toLowerCase().replace(/\s+/g, "_")
      : parsedFormatCandidate ?? initialFormat;

  const resolvedFormat = resolvedSpec.supportedFormats.includes(resolvedFormatCandidate)
    ? resolvedFormatCandidate
    : resolvedSpec.supportedFormats[0];

  // Determine selectedDimension for social "post".
  const selectedFromParsed = (parsedAny?.selectedDimension ?? null) as SocialDimensionPreset | null;
  const selectedFromText =
    isSocialPlatform(resolvedPlatform) && resolvedFormat === "post"
      ? getSocialPresetById(inferSocialDimensionIdFromText(prompt)) ?? null
      : null;

  const resolvedSelectedDimension: SocialDimensionPreset | null =
    (explicitSelected && isSocialPlatform(resolvedPlatform) && resolvedFormat === "post" ? explicitSelected : null) ??
    (selectedFromParsed && isSocialPlatform(resolvedPlatform) && resolvedFormat === "post" ? selectedFromParsed : null) ??
    selectedFromText ??
    (isSocialPlatform(resolvedPlatform) && resolvedFormat === "post" ? DEFAULT_SOCIAL_DIMENSION : null);

  const dimsFromParsed =
    (resolvedSelectedDimension && isSocialPlatform(resolvedPlatform) && resolvedFormat === "post"
      ? { width: resolvedSelectedDimension.width, height: resolvedSelectedDimension.height }
      : null) ??
    parsedAny?.dimensions ??
    partialIntent.dimensions ??
    defaultDims;

  const screenPlanFromParsed = Array.isArray(parsedAny?.screenPlan)
    ? (parsedAny.screenPlan as any[])
        .filter(Boolean)
        .map((s: any, idx: number) => ({
          screenIndex: typeof s.screenIndex === "number" ? s.screenIndex : idx,
          screenType: String(s.screenType ?? "screen"),
          screenTitle: String(s.screenTitle ?? ""),
          primaryAction: String(s.primaryAction ?? "Next"),
          navigationPattern:
            s.navigationPattern === "swipe" ||
            s.navigationPattern === "tab" ||
            s.navigationPattern === "back_button"
              ? s.navigationPattern
              : ("next_button" as const),
        }))
    : partialIntent.screenPlan;

  const merged: ParsedIntent = {
    platform: resolvedPlatform,
    format: resolvedFormat,
    dimensions: clampDimensions(resolvedPlatform, resolvedFormat, dimsFromParsed as any),
    selectedDimension: resolvedSelectedDimension,
    slideCount:
      parsed?.slideCount && parsed.slideCount > 0
        ? Math.min(parsed.slideCount, 10)
        : partialIntent.slideCount,
    screenCount:
      parsed?.screenCount && parsed.screenCount > 0
        ? Math.min(parsed.screenCount, 10)
        : partialIntent.screenCount,
    screenPlan: screenPlanFromParsed,
    appOS: (parsedAny?.appOS ?? partialIntent.appOS) as ParsedIntent["appOS"],
    appCategory: (parsedAny?.appCategory ?? partialIntent.appCategory) as ParsedIntent["appCategory"],
    appTheme: (parsedAny?.appTheme ?? partialIntent.appTheme) as ParsedIntent["appTheme"],
    styleContext: parsed?.styleContext ?? partialIntent.styleContext ?? [],
    contentRequirements: parsed?.contentRequirements ?? partialIntent.contentRequirements ?? [],
    requiresImageGeneration:
      parsed?.requiresImageGeneration ?? partialIntent.requiresImageGeneration ?? false,
    suggestedTemplateTags:
      parsed?.suggestedTemplateTags ?? partialIntent.suggestedTemplateTags ?? [],
    sectionPlan: Array.isArray(parsed?.sectionPlan)
      ? (parsed?.sectionPlan as any[]).map((x) => String(x)).filter(Boolean)
      : partialIntent.sectionPlan,
    designMood: parsed?.designMood ?? partialIntent.designMood ?? "minimal",
    colorPreference: parsed?.colorPreference ?? partialIntent.colorPreference ?? "brand",
    complexity: parsed?.complexity ?? partialIntent.complexity ?? "moderate",
  };

  return merged;
}

