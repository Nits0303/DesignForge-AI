import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";
import { parseShortcode, shortcodeToPartialIntent } from "@/lib/ai/shortcodeParser";
import { smartRouteIntent } from "@/lib/ai/smartRouter";
import { selectTemplatesForIntent } from "@/lib/ai/componentSelector";
import { assembleGenerationPrompt } from "@/lib/ai/promptAssembler";
import { chooseModel } from "@/lib/ai/modelRouter";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { anthropic } from "@/lib/ai/anthropicClient";
import { isGeminiPrimaryLlm, streamGeminiGeneration } from "@/lib/ai/geminiClient";
import { PROMPTS } from "@/lib/ai/prompts";
import { AI_MODELS, AI_PRICING, getPricingForModel } from "@/constants/models";
import type { ParsedIntent } from "@/types/ai";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { assembleRevisionPrompt } from "@/lib/ai/revisionPromptAssembler";
import { classifyRevision } from "@/lib/ai/revisionClassifier";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";
import { generateMultiSectionHtml } from "@/lib/ai/multiSectionGenerator";
import { generateMobileFlowHtml, shouldUseMobileFlowGenerator } from "@/lib/ai/mobileFlowGenerator";
import {
  detectTargetSectionType,
  extractSectionTypesFromHtml,
  reviseSectionTargeted,
} from "@/lib/ai/sectionTargetedRevisor";
import {
  buildReferenceVisionAttachments,
  getReferenceAnalysis,
  readImageFromStorageUrl,
} from "@/lib/ai/referenceAnalyzer";
import { computePromptStructureHash } from "@/lib/learning/hashUtils";
import {
  resolveAbTestsForGeneration,
  type MergedAbPromptContext,
  type TestAssignmentEntry,
} from "@/lib/ab/abTestAssignment";
import { getCurrentDefaultVersionKey } from "@/lib/ai/prompts/promptVersionRegistry";
import { getPlatformAdditionalInstruction, getPlatformTemplateSelectionDefaults } from "@/lib/db/platformDefaults";
import { startTraceRun, type TraceContext } from "@/lib/server/langsmith";
import { SOCIAL_MEDIA_ICON_ORDER, SOCIAL_MEDIA_ICON_SVGS, type SocialIconKey } from "@/constants/socialMediaIcons";
import type { SocialDimensionPreset } from "@/constants/platforms";

type GenerateArgs = {
  userId: string;
  brandId: string;
  projectId?: string;
  prompt: string;
  referenceImageUrl?: string;
  referenceIds?: string[];
  referenceRoles?: Record<string, "layout" | "style" | "color">;
  strategy?: "fast" | "quality";
  sectionPlanOverride?: string[];
  batchJobId?: string;
  selectedDimension?: SocialDimensionPreset | null;
  trace?: TraceContext;
  parentRunId?: string;
};

type PlanResult = {
  intent: ParsedIntent;
  templates: { id: string; htmlSnippet: string; tags: string[] }[];
  system: string;
  messages: any;
  systemPromptVersion: string;
  templateIdsUsed: string[];
  assembledUserPromptText: string;
  testVariantId: string | null;
  testAssignments: TestAssignmentEntry[];
  abMergedContext: MergedAbPromptContext;
  resolvedSystemVersionKey: string;
  model: string;
  maxTokens: number;
  estimatedCostUsd: number;
  promptMetadata?: any;
};

function isSocialPlatform(platform: unknown): boolean {
  const p = String(platform ?? "").toLowerCase();
  return p === "instagram" || p === "linkedin" || p === "facebook" || p === "twitter";
}

function shouldUseReferenceOverlayTemplate(args: {
  intent: ParsedIntent;
  prompt: string;
  referenceImageUrl?: string | null;
  referenceIds?: string[] | null;
}): boolean {
  if (!isSocialPlatform(args.intent.platform)) return false;
  if (String(args.intent.format ?? "").toLowerCase() !== "post") return false;
  const hasRef = Boolean(args.referenceImageUrl?.trim()) || (args.referenceIds?.length ?? 0) > 0;
  if (!hasRef) return false;

  const p = String(args.prompt ?? "");
  const asksOnlyTextChange =
    /\bonly\s+the\s+text\b/i.test(p) ||
    /\bonly\s+text\b/i.test(p) ||
    /\bonly\b.*\btext\b.*\bchange\b/i.test(p);
  const asksExactBackground =
    /\bexact\s+same\s+background\b/i.test(p) ||
    /\buse\s+the\s+exact\s+same\s+background\b/i.test(p) ||
    /\bsame\s+background\b/i.test(p) ||
    /\buse\s+the\s+exact\s+same\s+background\s+image\b/i.test(p);
  const mentionsReference =
    /\breference\s+image\b/i.test(p) || /\bfollow\b.*\breference\b/i.test(p) || /\bas\s+per\s+the\s+reference\b/i.test(p);

  return asksOnlyTextChange || asksExactBackground || mentionsReference;
}

function extractHiringRolesFromPrompt(prompt: string): string[] {
  const p = String(prompt ?? "");
  const roles: string[] = [];

  const normalizeRole = (raw: string): string => {
    const t = String(raw ?? "").trim().replace(/\s+/g, " ");
    const lower = t.toLowerCase();
    if (/\b(ai\/ml|aiml|ml|machine learning|ai engineer|ml engineer)\b/i.test(lower)) return "AI/ML Engineer";
    if (/\b(ui\/ux|ux|ui|product designer|ux designer)\b/i.test(lower)) return "UI/UX Engineer";
    if (/\bqa\b|\bquality assurance\b|\btest engineer\b/i.test(lower)) return "QA Engineer";
    if (/\bbusiness analyst\b|\bba\b/i.test(lower)) return "Business Analyst";
    // Preserve acronyms like AI/ML, UI/UX, QA.
    const withAcronyms = t
      .replace(/\bai\/ml\b/gi, "AI/ML")
      .replace(/\bui\/ux\b/gi, "UI/UX")
      .replace(/\bqa\b/gi, "QA");
    // Title-case the rest lightly.
    return withAcronyms
      .split(" ")
      .map((w) => (/^[A-Z]{2,}(?:\/[A-Z]{2,})?$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(" ");
  };

  const push = (r: string) => {
    const normalized = normalizeRole(r);
    const key = normalized.toLowerCase();
    if (!roles.some((x) => x.toLowerCase() === key)) roles.push(normalized);
  };

  if (/\b(ai\/ml|aiml|ml|machine learning|ai engineer|ml engineer)\b/i.test(p)) push("AI/ML Engineer");
  if (/\b(ui\/ux|ux|ui|product designer|ux designer)\b/i.test(p)) push("UI/UX Engineer");
  if (/\bqa\b|\bquality assurance\b|\btest engineer\b/i.test(p)) push("QA Engineer");
  if (/\bbusiness analyst\b|\bba\b/i.test(p)) push("Business Analyst");
  // If user listed roles explicitly with commas, try to extract common titles
  const explicit = p.match(/openings?\s+for\s+([^.\n]+)/i)?.[1];
  if (explicit) {
    for (const raw of explicit.split(/,| and /i)) {
      const t = raw.trim();
      if (t.length >= 4 && t.length <= 48) {
        // Title-case-ish normalization
        const cleaned = t.replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
        if (cleaned && cleaned.length <= 48) push(cleaned);
      }
    }
  }
  return roles.length ? roles.slice(0, 6) : ["AI/ML Engineer", "UI/UX Engineer", "QA Engineer", "Business Analyst"];
}

function buildReferenceOverlayHiringPosterHtml(args: {
  width: number;
  height: number;
  brandName: string;
  brandPrimary: string;
  brandAccent: string;
  headline: string;
  roles: string[];
}): string {
  const safeHeadline = args.headline || "We are hiring";
  const rolesHtml = args.roles
    .slice(0, 6)
    .map(
      (r) => `
      <li style="display:flex;align-items:center;gap:10px;">
        <span style="width:10px;height:10px;border-radius:999px;background:${args.brandAccent};box-shadow:0 0 0 4px rgba(255,255,255,0.10);flex:0 0 auto;"></span>
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.01em;line-height:1.15;">${r}</span>
      </li>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: ${args.width}px; height: ${args.height}px; margin: 0; }
    </style>
  </head>
  <body class="df-body" style="margin:0; width:${args.width}px; height:${args.height}px; overflow:hidden; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
    <main class="df-root" style="position:relative; width:100%; height:100%; overflow:hidden;">
      <!-- Policy A: reference is style only (never use reference pixels as background). -->
      <div class="df-bg" aria-hidden="true" style="position:absolute; inset:0; background:
        radial-gradient(1100px 700px at 20% 45%, rgba(255,255,255,0.92) 0%, rgba(245,247,250,0.92) 55%, rgba(240,244,248,0.90) 100%),
        linear-gradient(90deg, rgba(255,255,255,0.98) 0%, rgba(250,250,252,0.98) 52%, rgba(250,250,252,0.0) 70%);
      "></div>
      <div aria-hidden="true" style="position:absolute; right:-160px; top:-120px; width:760px; height:1150px; background:rgba(32,114,189,0.95); border-radius:420px; transform:rotate(8deg);"></div>
      <div aria-hidden="true" style="position:absolute; right:180px; top:130px; width:220px; height:220px; background:${args.brandAccent}; border-radius:999px; opacity:0.92;"></div>
      <div aria-hidden="true" style="position:absolute; right:110px; bottom:190px; width:360px; height:360px; background:rgba(255,255,255,0.92); border-radius:999px; border:4px solid rgba(32,114,189,0.55);"></div>
      <div aria-hidden="true" style="position:absolute; right:210px; bottom:-70px; width:340px; height:340px; background:rgba(245,158,11,0.95); border-radius:999px; opacity:0.92;"></div>
      <!-- contrast veil to keep text readable while preserving texture -->
      <div class="df-overlay" style="position:absolute; inset:0; background:linear-gradient(90deg, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.30) 48%, rgba(0,0,0,0.10) 72%, rgba(0,0,0,0) 100%);"></div>

      <!-- left content column -->
      <section style="position:absolute; inset:0; padding:64px 56px; display:flex; align-items:flex-start; justify-content:flex-start;">
        <div style="width:560px; max-width:58%; display:flex; flex-direction:column; gap:22px;">
          <div style="display:inline-flex; align-items:center; gap:10px;">
            <span style="display:inline-flex; align-items:center; padding:8px 12px; border-radius:999px; background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.18); font-size:13px; letter-spacing:0.08em; text-transform:uppercase;">
              ${args.brandName}
            </span>
            <span style="font-size:13px; opacity:.9;">New openings</span>
          </div>

          <h1 style="margin:0; font-size:86px; line-height:0.94; letter-spacing:-0.04em; font-weight:900;">
            ${safeHeadline}
          </h1>

          <div style="height:4px; width:168px; border-radius:999px; background:linear-gradient(90deg, ${args.brandPrimary}, ${args.brandAccent});"></div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            <div style="font-size:18px; opacity:.92; line-height:1.35;">
              We’re expanding our team. If you’re interested (or know someone who is), apply today.
            </div>
            <ul style="margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:14px;">
              ${rolesHtml}
            </ul>
          </div>

          <div style="margin-top:10px; display:flex; gap:12px; align-items:center;">
            <div style="padding:12px 16px; border-radius:14px; background:${args.brandPrimary}; color:white; font-weight:800; font-size:16px;">
              Apply now
            </div>
            <div style="padding:12px 16px; border-radius:14px; background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.18); color:white; font-weight:700; font-size:16px;">
              careers@${args.brandName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "company"}.com
            </div>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

async function planGeneration({
  userId,
  brandId,
  projectId,
  prompt,
  referenceImageUrl,
  referenceIds,
  referenceRoles,
  sectionPlanOverride,
  selectedDimension,
  trace,
  parentRunId,
}: GenerateArgs): Promise<{ plan: PlanResult; remainingPrompt: string; estimatedTokens: number }> {
  const shortcode = parseShortcode(prompt);
  const remainingPrompt = shortcode?.remainingPrompt ?? prompt;
  const partialFromShortcode = shortcode ? shortcodeToPartialIntent(shortcode) : {};
  if (sectionPlanOverride && Array.isArray(sectionPlanOverride)) {
    (partialFromShortcode as any).sectionPlan = sectionPlanOverride;
  }
  if (selectedDimension) {
    (partialFromShortcode as any).selectedDimension = selectedDimension;
  }

  const routed: ParsedIntent = await smartRouteIntent({
    userId,
    prompt: remainingPrompt,
    partialIntent: partialFromShortcode as ParsedIntent,
    trace: {
      ...(trace ?? {}),
      stage: "smart_router",
    },
    parentRunId,
  });

  const now = new Date();
  const ab = await resolveAbTestsForGeneration({
    userId,
    platform: routed.platform,
    format: String(routed.format),
    now,
  });
  const testAssignments = ab.assignments;
  const testVariantId = ab.legacyTestVariantId;
  const platInstr = await getPlatformAdditionalInstruction(routed.platform, String(routed.format));
  const abMerged =
    platInstr && !ab.merged.additionalInstruction?.trim()
      ? { ...ab.merged, additionalInstruction: platInstr }
      : ab.merged;

  const defaultSys = await getCurrentDefaultVersionKey(routed.platform, String(routed.format));
  const resolvedSystemVersionKey = abMerged.systemPromptVersion ?? defaultSys;

  let templateSelectionStrategy: "prefer_high_approval_rate" | "prefer_recency" | "prefer_diversity" =
    "prefer_high_approval_rate";
  let approvalRateMultiplier = 1;
  if (abMerged.templateSelectionStrategy === "prefer_recency") {
    templateSelectionStrategy = "prefer_recency";
  } else if (abMerged.templateSelectionStrategy === "prefer_diversity") {
    templateSelectionStrategy = "prefer_diversity";
  } else if (abMerged.templateSelectionStrategy === "prefer_high_approval") {
    templateSelectionStrategy = "prefer_high_approval_rate";
    approvalRateMultiplier = 2;
  } else {
    const plat = await getPlatformTemplateSelectionDefaults(routed.platform, String(routed.format));
    templateSelectionStrategy = plat.strategy;
    approvalRateMultiplier = plat.approvalRateMultiplier;
  }

  let templates = await selectTemplatesForIntent(routed, {
    userId,
    templateSelectionStrategy,
    approvalRateMultiplier,
  });
  if (templates.length === 0) {
    // Fallback: relax format to "all" so generation still gets structural template cues.
    const relaxedIntent = { ...routed, format: "all" as any };
    templates = await selectTemplatesForIntent(relaxedIntent as any, {
      userId,
      templateSelectionStrategy: "prefer_recency",
      approvalRateMultiplier: 1,
    });
  }

  const references: { referenceId: string; role?: "layout" | "style" | "color"; analysis: any }[] = [];
  for (const id of referenceIds ?? []) {
    const analysis = await getReferenceAnalysis(id);
    if (!analysis) continue;
    references.push({ referenceId: id, role: referenceRoles?.[id], analysis });
  }

  const referenceImageDataList = await buildReferenceVisionAttachments(
    userId,
    referenceIds,
    referenceImageUrl ?? null
  );

  const { system, messages, metadata } = await assembleGenerationPrompt({
    userId,
    brandId,
    intent: routed,
    templates,
    userPrompt: remainingPrompt,
    referenceImageUrl,
    referenceAnalyses: references,
    referenceImageDataList,
    resolvedSystemVersionKey,
    abVariantContext: abMerged,
  });

  const { model, maxTokens, estimatedCostUsd } = chooseModel(routed, metadata);

  const firstUserContent = messages?.[0]?.content;
  const firstTextBlock = Array.isArray(firstUserContent)
    ? firstUserContent.find((b: { type?: string; text?: string }) => b?.type === "text" && b.text != null)
    : undefined;
  const assembledUserPromptText =
    firstTextBlock && "text" in firstTextBlock ? String(firstTextBlock.text) : "";

  return {
    plan: {
      intent: routed,
      templates,
      system,
      messages,
      systemPromptVersion: metadata.systemVersion,
      templateIdsUsed: metadata.templateIds,
      assembledUserPromptText,
      testVariantId,
      testAssignments,
      abMergedContext: abMerged,
      resolvedSystemVersionKey,
      model,
      maxTokens,
      estimatedCostUsd,
      promptMetadata: metadata,
    },
    remainingPrompt,
    estimatedTokens:
      metadata.estimatedTokens.system +
      metadata.estimatedTokens.components +
      metadata.estimatedTokens.brand +
      metadata.estimatedTokens.request,
  };
}

// Used by the Anthropic Batch API worker to construct message batch requests
// (system + messages + model/maxTokens + prompt metadata) without actually generating designs.
export async function planDesignForAnthropicBatch(args: {
  userId: string;
  brandId: string;
  projectId?: string;
  prompt: string;
  referenceImageUrl?: string;
  referenceIds?: string[];
  referenceRoles?: Record<string, "layout" | "style" | "color">;
  strategy?: "fast" | "quality";
  sectionPlanOverride?: string[];
  batchJobId?: string;
}): Promise<{ plan: PlanResult; remainingPrompt: string; estimatedTokens: number }> {
  return planGeneration(args as any);
}

export async function generateDesign(args: GenerateArgs): Promise<{
  designId: string;
  versionId: string;
  html: string;
  model: string;
  estimatedTokens: number;
  estimatedCostUsd: number;
}> {
  const streamResult = await streamGenerateDesign(args, {});
  return {
    designId: streamResult.designId,
    versionId: streamResult.versionId,
    html: streamResult.finalHtml,
    model: streamResult.model,
    estimatedTokens: streamResult.estimatedTokens,
    estimatedCostUsd: streamResult.costUsd,
  };
}

function computeUsageCostUsd(model: string, usage: any): number {
  const pricing = getPricingForModel(model);
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const costInput =
    (inputTokens / 1_000_000) * pricing.inputPerMTokens +
    (cacheWrite / 1_000_000) * pricing.inputPerMTokens +
    (cacheRead / 1_000_000) * pricing.inputPerMTokens * AI_PRICING.CACHE_READ_DISCOUNT;
  const costOutput = (outputTokens / 1_000_000) * pricing.outputPerMTokens;
  return Number((costInput + costOutput).toFixed(6));
}

function logAiCacheSummaryDev(args: {
  stage: string;
  model: string;
  usage: any;
  estimatedTokens?: number | null;
  promptMeta?: { system?: number; components?: number; brand?: number; preferences?: number; request?: number } | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const usage = args.usage ?? {};
    const input = Number(usage?.input_tokens ?? 0);
    const output = Number(usage?.output_tokens ?? 0);
    const cached =
      Number(usage?.cache_read_input_tokens ?? 0) + Number(usage?.cache_creation_input_tokens ?? 0);
    const total = input + output;
    const fresh = Math.max(0, input - cached);
    const pct = total > 0 ? Math.round((cached / Math.max(1, input)) * 100) : 0;
    const cost = computeUsageCostUsd(args.model, usage);
    const meta = args.promptMeta;
    const parts = meta
      ? ` | parts(system=${meta.system ?? 0}, components=${meta.components ?? 0}, brand=${meta.brand ?? 0}, prefs=${
          meta.preferences ?? 0
        }, request=${meta.request ?? 0})`
      : "";
    console.log(
      `[AI Cache] ${args.stage} | model=${args.model} | Total: ${total} tokens | Cached: ${cached} (${pct}%) | Fresh: ${fresh} | Cost: $${cost}${args.estimatedTokens ? ` | Est: ${args.estimatedTokens}` : ""}${parts}`
    );
  } catch {
    // ignore
  }
}

async function postProcessWithEmptyFallback(args: {
  html: string;
  plan: PlanResult;
  brand: { name: string; typography: any; colors: any; logoPrimaryUrl?: string | null };
  userId: string;
  designId: string;
  userPrompt: string;
  referenceImageUrl?: string | null;
  referenceIds?: string[] | null;
  trace?: TraceContext;
  parentRunId?: string;
}): Promise<{ html: string; warnings: string[] }> {
  // Keep generation cheap and deterministic: we do not do any second-pass paid regeneration here.
  // If the model output is empty/invalid/low-quality, we immediately fall back to a local HTML poster.
  const allowExpensiveRegeneration = false;
  const attemptPostProcess = async (candidateHtml: string) =>
    postProcessHtml({
      html: candidateHtml.trim(),
      intent: args.plan.intent,
      brand: args.brand,
      userPrompt: args.userPrompt,
      abModifiers: {
        headlineSizeMultiplier: args.plan.abMergedContext?.headlineSizeModifier,
        spacingMultiplier: args.plan.abMergedContext?.spacingModifier,
      },
      repairMalformedHtml: async (malformedHtml) => {
        const repairRun = await startTraceRun({
          name: "repair_malformed_html",
          runType: "llm",
          inputs: { htmlLength: malformedHtml.length },
          tags: ["postprocess", "repair"],
          trace: {
            ...(args.trace ?? {}),
            stage: "repair_malformed_html",
          },
          parentRunId: args.parentRunId,
        });
        const repairResponse = await callAnthropicWithRetry(
          {
            model: AI_MODELS.GENERATOR_SONNET,
            system:
              "The following HTML is malformed. Fix the structural issues and return the corrected complete HTML.",
            max_tokens: args.plan.maxTokens,
            messages: [{ role: "user", content: [{ type: "text", text: malformedHtml }] }],
          },
          {
            userId: args.userId,
            designId: args.designId,
            trace: {
              ...(args.trace ?? {}),
              stage: "repair_malformed_html",
            },
            parentRunId: repairRun?.id ?? args.parentRunId,
          }
        );
        await repairRun?.finish({
          outputs: {
            model: repairResponse.model,
            inputTokens: repairResponse.usage?.input_tokens ?? 0,
            outputTokens: repairResponse.usage?.output_tokens ?? 0,
          },
        });
        return repairResponse.content[0]?.type === "text"
          ? repairResponse.content[0].text.trim()
          : malformedHtml;
      },
    });

  try {
    return await attemptPostProcess(args.html);
  } catch (err: any) {
    if (
      err?.code !== "GENERATION_EMPTY_HTML" &&
      err?.code !== "GENERATION_INVALID_HTML" &&
      err?.code !== "GENERATION_LOW_QUALITY"
    ) {
      throw err;
    }
  }

  if (allowExpensiveRegeneration) {
    try {
      const regenRun = await startTraceRun({
        name: "postprocess_regenerate",
        runType: "llm",
        inputs: {
          intentPlatform: args.plan.intent.platform,
          intentFormat: String(args.plan.intent.format),
          promptLength: args.plan.assembledUserPromptText.length,
        },
        tags: ["postprocess", "regenerate"],
        trace: {
          ...(args.trace ?? {}),
          stage: "postprocess_regenerate",
        },
        parentRunId: args.parentRunId,
      });

      const retryResponse = await callAnthropicWithRetry(
        {
          model: AI_MODELS.GENERATOR_SONNET,
          system:
            "You are a senior web UI designer. Return ONLY complete HTML (no markdown). Build a real, populated full-bleed poster layout with visible hierarchy and CTA elements. Avoid empty wrappers. Use inline styles and utility classes. Ensure the design fills the entire canvas (no large outer margins). Never overlap headline/subheadline layers. Keep clear vertical spacing and strong readability contrast. For social posts, prevent overflow by limiting copy density and using concise bullets. If the prompt asks for a background image, implement it as full-canvas absolute inset image with object-cover, plus a readable overlay and foreground content layer.",
          max_tokens: args.plan.maxTokens,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `The previous generation failed quality validation (empty, malformed, or low-quality overlap).\n` +
                    `Regenerate from scratch with richer visible content.\n\n` +
                    `INTENT JSON:\n${JSON.stringify(args.plan.intent, null, 2)}\n\n` +
                    `USER REQUEST:\n${args.plan.assembledUserPromptText}\n\n` +
                    `Return only complete HTML.`,
                },
              ],
            },
          ],
        },
        {
          userId: args.userId,
          designId: args.designId,
          trace: {
            ...(args.trace ?? {}),
            stage: "postprocess_regenerate",
          },
          parentRunId: regenRun?.id ?? args.parentRunId,
        }
      );

      await regenRun?.finish({
        outputs: {
          model: retryResponse.model,
          inputTokens: retryResponse.usage?.input_tokens ?? 0,
          outputTokens: retryResponse.usage?.output_tokens ?? 0,
        },
      });

      const retryHtml =
        retryResponse.content[0]?.type === "text" ? retryResponse.content[0].text.trim() : "";
      try {
        if (!retryHtml) throw Object.assign(new Error("Empty retry"), { code: "GENERATION_EMPTY_HTML" });
        return await attemptPostProcess(retryHtml);
      } catch (err: any) {
        if (
          err?.code !== "GENERATION_EMPTY_HTML" &&
          err?.code !== "GENERATION_INVALID_HTML" &&
          err?.code !== "GENERATION_LOW_QUALITY"
        ) {
          throw err;
        }
      }
    } catch (e) {
      // If the expensive regeneration call fails (missing Anthropic key, provider outage, etc.),
      // fall through to the deterministic fallback so the user still gets a usable poster.
      console.warn("[postProcess] Expensive regeneration failed; using deterministic fallback.", e);
    }
  }

  // Last-resort deterministic fallback so users always get a visible full-bleed poster.
  const palette = (args.brand.colors ?? {}) as Record<string, string>;
  const bg = palette.background || "#111827";
  const fg = palette.text || "#ffffff";
  const primary = palette.primary || "#6366f1";
  const accent = palette.accent || "#a78bfa";
  const title = args.userPrompt.replace(/^\/\w+\s*/i, "").trim() || "Design ready";
  const dims = Array.isArray(args.plan.intent.dimensions)
    ? args.plan.intent.dimensions[0]
    : (args.plan.intent.dimensions as any);
  const canvasW = Number(dims?.width ?? 1200);
  const canvasH = Number(dims?.height ?? 627);

  const fallbackHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body class="df-fallback-body" style="margin:0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:${bg}; color:${fg}; width:${canvasW}px; height:${canvasH}px; overflow:hidden;">
    <main class="df-fallback-root" style="width:100%; height:100%; position:relative; box-sizing:border-box; padding:22px; display:grid; grid-template-rows:auto 1fr auto;">
      <!-- Policy A: never use reference pixels as background; always use CSS layers. -->
      <div aria-hidden="true" style="position:absolute; inset:-2px; z-index:0; background:
        radial-gradient(1200px 780px at 85% 10%, rgba(255,255,255,0.18), transparent 55%),
        radial-gradient(900px 520px at 10% 90%, rgba(99,102,241,0.18), transparent 55%),
        linear-gradient(135deg, ${bg} 0%, #1f2937 100%);"></div>
      <div aria-hidden="true" style="position:absolute; right:-140px; top:-120px; width:520px; height:860px; background:rgba(59,130,246,0.55); border-radius:420px; transform:rotate(10deg); z-index:1;"></div>
      <div aria-hidden="true" style="position:absolute; left:-120px; bottom:-140px; width:520px; height:520px; background:rgba(167,139,250,0.40); border-radius:999px; z-index:1;"></div>
      <div class="df-fallback-overlay" style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%);z-index:2;"></div>
      <div style="position:relative;z-index:2;display:contents;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:inline-flex; gap:8px; align-items:center; font-size:12px; padding:6px 10px; border-radius:999px; background:rgba(255,255,255,0.14);">${String(
          args.plan.intent.platform
        )} • ${String(args.plan.intent.format)}</div>
        <div style="width:40px;height:40px;border-radius:8px;background:${primary};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;">AI</div>
      </div>
      <section style="display:grid; grid-template-columns: 1.1fr 0.9fr; gap:20px; align-items:center;">
        <div>
          <h1 style="margin:0 0 10px; font-size:54px; line-height:1.02; letter-spacing:-0.02em;">${title}</h1>
          <p style="margin:0; opacity:.92; font-size:20px; line-height:1.35;">Join our team to build impactful AI systems and solve real-world product challenges.</p>
        </div>
        <div style="border:1px solid rgba(255,255,255,0.18); border-radius:14px; padding:16px; background:rgba(255,255,255,0.06);">
          <div style="font-size:14px; opacity:.9; margin-bottom:10px;">Why join us</div>
          <ul style="margin:0; padding-left:18px; display:grid; gap:8px; font-size:14px;">
            <li>Work on production AI features</li>
            <li>Strong mentorship and learning</li>
            <li>Competitive pay and flexibility</li>
          </ul>
        </div>
      </section>
      <div style="display:flex; gap:10px; align-items:center;">
        <button style="background:${primary}; color:white; border:0; border-radius:10px; padding:12px 18px; font-weight:700;">Apply now</button>
        <button style="background:${accent}; color:white; border:0; border-radius:10px; padding:12px 18px; font-weight:700;">Learn more</button>
      </div>
      </div>
    </main>
  </body>
</html>`;

  return attemptPostProcess(fallbackHtml);
}

function cleanModelHtmlOutput(raw: string): string {
  let out = String(raw ?? "").trim();
  out = out.replace(/^["']?```(?:html|HTML)?\s*/i, "");
  out = out.replace(/\s*```["']?$/i, "");
  out = out.replace(/^(?:['"`]{2,}\s*html|html)\s*\n+/i, "");
  const firstDocTag = out.search(/<(?:!doctype|html|div|main|section|article|header|footer|nav|img)\b/i);
  if (firstDocTag > 0) out = out.slice(firstDocTag);
  return out.trim();
}

function extractWebsiteUrlFromText(text: string): string | null {
  const m = String(text ?? "").match(/https?:\/\/[^\s)]+|www\.[^\s)]+/i);
  if (!m) return null;
  const raw = m[0].trim().replace(/[),.;!?]+$/, "");
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function pickBrandWebsite(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return extractWebsiteUrlFromText(raw);
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === "string") {
        const found = extractWebsiteUrlFromText(x);
        if (found) return found;
      }
    }
    return null;
  }
  if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      const found = extractWebsiteUrlFromText(v);
      if (!found) continue;
      if (/website|site|url|link/i.test(k)) return found;
    }
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      const found = extractWebsiteUrlFromText(v);
      if (found) return found;
    }
  }
  return null;
}

function ensureRevisionRequestedElements(args: {
  html: string;
  revisionPrompt: string;
  logoUrl?: string | null;
  socialHandles?: unknown;
}): string {
  let out = cleanModelHtmlOutput(args.html);
  const req = String(args.revisionPrompt ?? "");
  const wantsLogoTop = /\blogo\b.*\b(top|header|first)\b|\b(top|header|first)\b.*\blogo\b/i.test(req);
  const wantsSocialIcons = /\bsocial\s*icons?\b|\bicons?\b.*\b(twitter|x|linkedin|instagram|facebook)\b/i.test(req);
  const wantsWebsiteUrl = /\bwebsite\s*url\b|\bwebsite\s*link\b|\badd\s+(?:a\s+)?(?:url|link)\b|\bfooter\b.*\b(url|link)\b/i.test(req);
  const lower = out.toLowerCase();

  if (wantsLogoTop && args.logoUrl) {
    const src = String(args.logoUrl).trim();
    if (src) {
      const esc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out
        .replace(new RegExp(`<img[^>]*src=["']${esc}["'][^>]*>`, "gi"), "")
        .replace(new RegExp(`<img[^>]*src=['"]${esc}['"][^>]*>`, "gi"), "");

      const header = `<div data-designforge-revision-logo="1" style="position:absolute;top:0;left:0;z-index:60;padding:6px 8px 4px 8px;display:flex;align-items:flex-start;justify-content:flex-start;"><img src="${src}" alt="Company logo" style="max-width:140px;max-height:52px;object-fit:contain;display:block;" /></div>`;
      out = /<body[^>]*>/i.test(out)
        ? out.replace(/<body([^>]*)>/i, `<body$1>${header}`)
        : `${header}${out}`;
    }
  }

  const resolvedUrl =
    extractWebsiteUrlFromText(req) ?? pickBrandWebsite(args.socialHandles) ?? "https://www.yourwebsite.com";
  const hasFooter = /<footer[\s>]/i.test(out);
  const hasWebsiteLink = /<a[^>]+href=["'][^"']+["'][^>]*>[^<]*<\/a>/i.test(out);
  const hasSocialWords = /\b(linkedin|instagram|facebook|twitter|x\.com)\b/i.test(lower);

  if (wantsSocialIcons) {
    const iconAnchors = SOCIAL_MEDIA_ICON_ORDER.map((k: SocialIconKey) => {
      const svg = SOCIAL_MEDIA_ICON_SVGS[k];
      const label =
        k === "twitterX"
          ? "Twitter/X"
          : k === "linkedin"
            ? "LinkedIn"
            : k === "instagram"
              ? "Instagram"
              : k === "facebook"
                ? "Facebook"
                : k;
      const href =
        k === "twitterX"
          ? "https://x.com"
          : k === "linkedin"
            ? "https://linkedin.com"
            : k === "instagram"
              ? "https://instagram.com"
              : k === "facebook"
                ? "https://facebook.com"
                : "#";
      return `<a href="${href}" aria-label="${label}" data-designforge-social-icon="${k}" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);text-decoration:none;color:inherit;">${svg}</a>`;
    }).join("");

    const overlay = `<div data-designforge-social-icons-overlay="1" style="position:absolute;bottom:18px;right:18px;z-index:70;display:flex;gap:12px;align-items:center;">${iconAnchors}</div>`;
    if (!/data-designforge-social-icons-overlay="1"/i.test(out)) {
      out = /<body([^>]*)>/i.test(out)
        ? out.replace(/<body([^>]*)>/i, `<body$1>${overlay}`)
        : `${overlay}${out}`;
    }
  }

  if (wantsWebsiteUrl && !hasWebsiteLink) {
    const footer = `<footer data-designforge-revision-footer="1" style="margin-top:10px;padding:12px 16px;border-top:1px solid rgba(148,163,184,.35);display:flex;align-items:center;justify-content:space-between;gap:12px;">
  <a href="${resolvedUrl}" style="font-size:13px;color:inherit;text-decoration:none;opacity:.9;">${resolvedUrl.replace(/^https?:\/\//i, "")}</a>
</footer>`;
    if (hasFooter) {
      out = out.replace(/<\/footer>/i, `${footer}</footer>`);
    } else if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${footer}</body>`);
    } else {
      out = `${out}\n${footer}`;
    }
  }

  return out;
}

async function createRevisionVersionAtomically(args: {
  designId: string;
  htmlContent: string;
  revisionPrompt: string;
  aiModelUsed: string;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  generationTimeMs: number;
}): Promise<{ version: { id: string }; versionNumber: number }> {
  return prisma.$transaction(async (tx) => {
    const updatedDesign = await tx.design.update({
      where: { id: args.designId },
      data: {
        currentVersion: { increment: 1 },
        status: "preview",
      },
      select: { currentVersion: true },
    });
    const versionNumber = updatedDesign.currentVersion;
    const version = await tx.designVersion.create({
      data: {
        designId: args.designId,
        versionNumber,
        htmlContent: args.htmlContent,
        revisionPrompt: args.revisionPrompt,
        aiModelUsed: args.aiModelUsed,
        promptTokens: args.promptTokens,
        completionTokens: args.completionTokens,
        cachedTokens: args.cachedTokens,
        generationTimeMs: args.generationTimeMs,
      },
      select: { id: true },
    });
    return { version, versionNumber };
  });
}

// Used by the Anthropic Batch API worker to persist a finished Claude response
// into `Design` + `DesignVersion` + `GenerationLog`, matching the non-stream path.
export async function persistSingleDesignFromPlannedBatchResult(args: {
  userId: string;
  brandId: string;
  projectId?: string;
  prompt: string;
  batchJobId?: string;
  plan: PlanResult;
  remainingPrompt: string;
  html: string;
  usage: any;
  costUsdMultiplier?: number;
}): Promise<{
  designId: string;
  versionId: string;
  versionNumber: number;
  finalHtml: string;
  model: string;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  generationTimeMs: number;
}> {
  const startedAt = Date.now();
  const { userId, brandId, projectId, prompt, batchJobId, plan, remainingPrompt, html, usage } = args;
  const costUsdMultiplier = args.costUsdMultiplier ?? 1;

  const brand = await prisma.brandProfile.findUnique({ where: { id: brandId } });
  if (!brand) throw new Error("Brand not found during batch persistence");

  // For batch generation we always create a fresh design record.
  const design = await prisma.design.create({
    data: {
      userId,
      brandId,
      projectId: projectId ?? null,
      title: remainingPrompt.slice(0, 80) || "Untitled design",
      originalPrompt: prompt,
      parsedIntent: plan.intent as any,
      platform: plan.intent.platform,
      format: String(plan.intent.format),
      dimensions: plan.intent.dimensions as any,
      selectedDimensionId: plan.intent.selectedDimension?.id ?? null,
      referenceIds: [],
      status: "generating",
      tags: [],
    },
  });

  const repaired = await postProcessWithEmptyFallback({
    html,
    plan,
    brand: {
      name: brand.name,
      typography: brand.typography as any,
      colors: brand.colors as any,
      logoPrimaryUrl: brand.logoPrimaryUrl ?? null,
    },
    userId,
    designId: design.id,
    userPrompt: remainingPrompt,
    referenceImageUrl: null,
    referenceIds: null,
  });

  const cachedTokens =
    (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
  const totalTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  const baseCostUsd = computeUsageCostUsd(plan.model, usage);
  const costUsd = Number((baseCostUsd * costUsdMultiplier).toFixed(6));
  const generationTimeMs = Date.now() - startedAt;

  const versionNumber = 1;
  const version = await prisma.designVersion.create({
    data: {
      designId: design.id,
      versionNumber,
      htmlContent: repaired.html,
      revisionPrompt: null,
      aiModelUsed: plan.model,
      promptTokens: usage?.input_tokens ?? null,
      completionTokens: usage?.output_tokens ?? null,
      cachedTokens,
      generationTimeMs,
    },
  });

  await prisma.design.update({
    where: { id: design.id },
    data: {
      currentVersion: versionNumber,
      status: "preview",
      updatedAt: new Date(),
    },
  });

  // Learning engine data: store generation so prompt scoring/preferences can learn.
  void createGenerationLogRecord({
    designId: design.id,
    userId,
    brandId,
    platform: plan.intent.platform,
    format: String(plan.intent.format),
    systemPromptVersion: plan.systemPromptVersion,
    templateIdsUsed: plan.templateIdsUsed,
    assembledUserPromptText: plan.assembledUserPromptText,
    system: plan.system,
    fullPromptHash: sha256Hex(`${plan.system}\n\n${plan.assembledUserPromptText}`),
    model: plan.model,
    totalTokens,
    estimatedCostUsd: plan.estimatedCostUsd,
    costUsd,
    revisionCount: 0,
    wasApproved: null,
    testVariantId: plan.testVariantId,
    testAssignments: plan.testAssignments,
    generationTimeMs,
    batchJobId,
    sectionCount: Array.isArray(plan.intent.sectionPlan) ? plan.intent.sectionPlan.length : null,
    sectionPlan: Array.isArray(plan.intent.sectionPlan) ? plan.intent.sectionPlan : null,
  }).catch(() => {});

  // Enqueue thumbnail generation.
  void enqueueExportJob({ designId: design.id, versionNumber, format: "thumbnail" }).catch(() => {});

  return {
    designId: design.id,
    versionId: version.id,
    versionNumber,
    finalHtml: repaired.html,
    model: plan.model,
    totalTokens,
    cachedTokens,
    costUsd,
    generationTimeMs,
  };
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function createGenerationLogRecord(opts: {
  designId: string;
  userId: string;
  brandId: string;
  platform: string;
  format: string;
  systemPromptVersion: string;
  templateIdsUsed: string[];
  assembledUserPromptText: string;
  system: string;
  fullPromptHash: string;
  model: string;
  totalTokens: number;
  estimatedCostUsd: number;
  costUsd: number;
  batchJobId?: string;
  revisionCount?: number;
  wasApproved?: boolean | null;
  testVariantId?: string | null;
  testAssignments?: TestAssignmentEntry[];
  generationTimeMs?: number | null;
  sectionCount?: number | null;
  sectionPlan?: any;
  sectionFailures?: any;
  generationStrategy?: string | null;
  parallelBatches?: number | null;
}) {
  const promptStructureHash = computePromptStructureHash({
    systemPromptVersion: opts.systemPromptVersion,
    templateIds: opts.templateIdsUsed,
    platform: opts.platform,
    format: opts.format,
  });

  return prisma.generationLog.create({
    data: {
      designId: opts.designId,
      userId: opts.userId,
      brandId: opts.brandId,
      batchJobId: opts.batchJobId ?? null,
      platform: opts.platform,
      format: opts.format,
      fullPromptHash: opts.fullPromptHash,
      systemPromptVersion: opts.systemPromptVersion,
      promptStructureHash,
      templateIdsUsed: opts.templateIdsUsed,
      model: opts.model,
      totalTokens: opts.totalTokens,
      estimatedCostUsd: opts.estimatedCostUsd,
      costUsd: opts.costUsd,
      revisionCount: opts.revisionCount ?? 0,
      wasApproved: opts.wasApproved ?? null,
      sessionDurationMs: null,

      sectionCount: opts.sectionCount ?? null,
      sectionPlan: opts.sectionPlan ?? null,
      sectionFailures: opts.sectionFailures ?? null,
      generationStrategy: opts.generationStrategy ?? null,
      parallelBatches: opts.parallelBatches ?? null,
      testVariantId: opts.testVariantId ?? null,
      testAssignments: (opts.testAssignments?.length ? opts.testAssignments : null) as any,
      generationTimeMs: opts.generationTimeMs ?? null,
    } as any,
  });
}

async function bumpLatestUnapprovedRevisionCount(designId: string, userId: string) {
  // Revisions should affect the latest "live" generation log that hasn't been approved/exported yet.
  const latest = await prisma.generationLog.findFirst({
    where: { designId, userId, wasApproved: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return;
  await prisma.generationLog.update({
    where: { id: latest.id },
    data: { revisionCount: { increment: 1 } },
  });
}

type StreamGenerateArgs = GenerateArgs & {
  existingDesignId?: string;
  nextVersionNumber?: number;
};

type StreamGenerateCallbacks = {
  onStatus?: (payload: {
    designId: string;
    status: "generating";
    model: string;
    estimatedTokens: number;
    platform: string;
    format: string;
    dimensions: unknown;
    sectionPlan?: string[];
    sectionCount?: number;
    message?: string;
  }) => void | Promise<void>;
  onChunk?: (payload: { html: string }) => void | Promise<void>;
  onImageStart?: (payload: { imageCount: number }) => void | Promise<void>;
  onImageComplete?: (payload: { updatedHtml: string }) => void | Promise<void>;
  onSectionStart?: (payload: {
    sectionType: string;
    sectionIndex: number;
    totalSections: number;
  }) => void | Promise<void>;
  onSectionComplete?: (payload: {
    sectionType: string;
    sectionIndex: number;
    sectionHtml: string;
    assembledHtml: string;
  }) => void | Promise<void>;
  onScreenStart?: (payload: {
    screenIndex: number;
    screenType: string;
    screenTitle: string;
    totalScreens: number;
  }) => void | Promise<void>;
  onScreenComplete?: (payload: {
    screenIndex: number;
    screenType: string;
    screenHtml: string;
  }) => void | Promise<void>;
};

export async function streamGenerateDesign(
  args: StreamGenerateArgs,
  cb: StreamGenerateCallbacks
): Promise<{
  designId: string;
  versionId: string;
  versionNumber: number;
  finalHtml: string;
  model: string;
  estimatedTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  generationTimeMs: number;
}> {
  const start = Date.now();
  const { plan, remainingPrompt, estimatedTokens } = await planGeneration(args);
  const { userId, brandId, projectId, prompt, existingDesignId } = args;

  const brand = await prisma.brandProfile.findUnique({ where: { id: brandId } });
  if (!brand) throw new Error("Brand not found during generation");

  const design =
    existingDesignId != null
      ? await prisma.design.update({
          where: { id: existingDesignId },
          data: {
            status: "generating",
            parsedIntent: plan.intent as any,
            platform: plan.intent.platform,
            format: String(plan.intent.format),
            dimensions: plan.intent.dimensions as any,
            selectedDimensionId: plan.intent.selectedDimension?.id ?? null,
            referenceIds: args.referenceIds ?? [],
          },
        })
      : await prisma.design.create({
          data: {
            userId,
            brandId,
            projectId: projectId ?? null,
            title: remainingPrompt.slice(0, 80) || "Untitled design",
            originalPrompt: prompt,
            parsedIntent: plan.intent as any,
            platform: plan.intent.platform,
            format: String(plan.intent.format),
            dimensions: plan.intent.dimensions as any,
            selectedDimensionId: plan.intent.selectedDimension?.id ?? null,
            referenceIds: args.referenceIds ?? [],
            status: "generating",
            tags: [],
          },
        });

  await cb.onStatus?.({
    designId: design.id,
    status: "generating",
    model: plan.model,
    estimatedTokens,
    platform: plan.intent.platform,
    format: String(plan.intent.format),
    dimensions: plan.intent.dimensions,
    sectionPlan: plan.intent.sectionPlan,
    sectionCount: Array.isArray(plan.intent.sectionPlan) ? plan.intent.sectionPlan.length : undefined,
  });

  // Cheap, reliable one-shot path: if the user insists on "follow the reference / only change text",
  // we generate a deterministic poster that recreates the reference *style* in pure CSS (Policy A)
  // WITHOUT calling an LLM.
  if (
    shouldUseReferenceOverlayTemplate({
      intent: plan.intent,
      prompt: remainingPrompt,
      referenceImageUrl: args.referenceImageUrl ?? null,
      referenceIds: (args.referenceIds ?? null) as any,
    })
  ) {
    const dims = Array.isArray(plan.intent.dimensions)
      ? plan.intent.dimensions[0]
      : (plan.intent.dimensions as any);
    const width = Number(dims?.width ?? 1080);
    const height = dims?.height === "auto" ? 1350 : Number(dims?.height ?? 1350);
    {
      const palette = (brand.colors ?? {}) as any;
      const primary = String(palette.primary ?? "#2563EB");
      const accent = String(palette.accent ?? "#FF4D8D");
      const roles = extractHiringRolesFromPrompt(remainingPrompt);
      const html = buildReferenceOverlayHiringPosterHtml({
        width,
        height,
        brandName: String(brand.name ?? "Company"),
        brandPrimary: primary,
        brandAccent: accent,
        headline: "WE ARE HIRING",
        roles,
      });

      const repaired = await postProcessWithEmptyFallback({
        html,
        plan,
        brand: {
          name: brand.name,
          typography: brand.typography as any,
          colors: brand.colors as any,
          logoPrimaryUrl: brand.logoPrimaryUrl ?? null,
        },
        userId,
        designId: design.id,
        userPrompt: remainingPrompt,
        referenceImageUrl: args.referenceImageUrl ?? null,
        referenceIds: (args.referenceIds ?? null) as any,
        trace: args.trace,
        parentRunId: args.parentRunId,
      });

      const versionNumber = args.nextVersionNumber ?? 1;
      const version = await prisma.designVersion.create({
        data: {
          designId: design.id,
          versionNumber,
          htmlContent: repaired.html,
          revisionPrompt: null,
          aiModelUsed: "deterministic-reference-overlay",
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          generationTimeMs: Date.now() - start,
        },
      });

      await prisma.design.update({
        where: { id: design.id },
        data: {
          currentVersion: versionNumber,
          status: "preview",
          updatedAt: new Date(),
        },
      });

      void enqueueExportJob({ designId: design.id, versionNumber, format: "thumbnail" }).catch(() => {});

      return {
        designId: design.id,
        versionId: version.id,
        versionNumber,
        finalHtml: repaired.html,
        model: "deterministic-reference-overlay",
        estimatedTokens,
        totalTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        generationTimeMs: Date.now() - start,
      };
    }
  }

  const wantsMobileFlow = shouldUseMobileFlowGenerator(plan.intent);

  if (wantsMobileFlow) {
    const mf = await generateMobileFlowHtml(
      {
        userId,
        brandId,
        intent: plan.intent,
        userPrompt: remainingPrompt,
        referenceImageUrl: args.referenceImageUrl,
        model: plan.model,
        maxTokens: plan.maxTokens,
        strategy: args.strategy ?? "quality",
      },
      {
        onScreenStart: async (p) => cb.onScreenStart?.(p),
        onScreenComplete: async (p) => cb.onScreenComplete?.(p),
      }
    );

    const versionNumber = args.nextVersionNumber ?? 1;
    const version = await prisma.designVersion.create({
      data: {
        designId: design.id,
        versionNumber,
        htmlContent: mf.finalHtml,
        revisionPrompt: null,
        aiModelUsed: plan.model,
        promptTokens: mf.totalTokens,
        completionTokens: null,
        cachedTokens: mf.cachedTokens,
        generationTimeMs: mf.generationTimeMs,
        isMultiScreen: true,
        screenCount: mf.screenCount,
      },
    });

    await prisma.design.update({
      where: { id: design.id },
      data: {
        currentVersion: versionNumber,
        status: "preview",
        updatedAt: new Date(),
      },
    });

    void createGenerationLogRecord({
      designId: design.id,
      userId: args.userId,
      brandId,
      platform: plan.intent.platform,
      format: String(plan.intent.format),
      systemPromptVersion: plan.systemPromptVersion,
      templateIdsUsed: plan.templateIdsUsed,
      assembledUserPromptText: plan.assembledUserPromptText,
      system: plan.system,
      fullPromptHash: sha256Hex(`${plan.system}\n\n${plan.assembledUserPromptText}`),
      model: plan.model,
      totalTokens: mf.totalTokens,
      estimatedCostUsd: plan.estimatedCostUsd,
      costUsd: mf.costUsd,
      revisionCount: 0,
      wasApproved: null,
      testVariantId: plan.testVariantId,
      testAssignments: plan.testAssignments,
      generationTimeMs: mf.generationTimeMs,
      batchJobId: args.batchJobId,
      sectionCount: mf.screenCount,
      sectionPlan: plan.intent.screenPlan ?? null,
      sectionFailures: mf.screenFailures,
      generationStrategy: "mobile_flow",
      parallelBatches: null,
    }).catch(() => {});

    void enqueueExportJob({
      designId: design.id,
      versionNumber,
      format: "thumbnail",
    }).catch(() => {});

    return {
      designId: design.id,
      versionId: version.id,
      versionNumber,
      finalHtml: mf.finalHtml,
      model: plan.model,
      estimatedTokens,
      totalTokens: mf.totalTokens,
      cachedTokens: mf.cachedTokens,
      costUsd: mf.costUsd,
      generationTimeMs: mf.generationTimeMs,
    };
  }

  const wantsMultiSection =
    (plan.intent.platform === "website" || plan.intent.platform === "dashboard") &&
    (!Array.isArray(plan.intent.sectionPlan) || plan.intent.sectionPlan.length >= 4);

  if (wantsMultiSection) {
    const multi = await generateMultiSectionHtml(
      {
        userId,
        brandId,
        intent: plan.intent,
        userPrompt: remainingPrompt,
        referenceImageUrl: args.referenceImageUrl,
        model: plan.model,
        maxTokens: plan.maxTokens,
        strategy: args.strategy ?? "quality",
      },
      {
        onSectionStart: async (p) => cb.onSectionStart?.(p),
        onSectionComplete: async (p) => cb.onSectionComplete?.(p),
      }
    );

    const versionNumber = args.nextVersionNumber ?? 1;
    const version = await prisma.designVersion.create({
      data: {
        designId: design.id,
        versionNumber,
        htmlContent: multi.finalHtml,
        revisionPrompt: null,
        aiModelUsed: plan.model,
        promptTokens: multi.totalTokens,
        completionTokens: null,
        cachedTokens: multi.cachedTokens,
        generationTimeMs: multi.generationTimeMs,
      },
    });

    await prisma.design.update({
      where: { id: design.id },
      data: {
        currentVersion: versionNumber,
        status: "preview",
        updatedAt: new Date(),
      },
    });

    // Learning engine data: record this generation so prompt scoring & preferences can learn.
    void createGenerationLogRecord({
      designId: design.id,
      userId: args.userId,
      brandId,
      platform: plan.intent.platform,
      format: String(plan.intent.format),
      systemPromptVersion: plan.systemPromptVersion,
      templateIdsUsed: plan.templateIdsUsed,
      assembledUserPromptText: plan.assembledUserPromptText,
      system: plan.system,
      fullPromptHash: sha256Hex(`${plan.system}\n\n${plan.assembledUserPromptText}`),
      model: plan.model,
      totalTokens: multi.totalTokens,
      estimatedCostUsd: plan.estimatedCostUsd,
      costUsd: multi.costUsd,
      revisionCount: 0,
      wasApproved: null,
      testVariantId: plan.testVariantId,
      testAssignments: plan.testAssignments,
      generationTimeMs: multi.generationTimeMs,
      batchJobId: args.batchJobId,
      sectionCount: multi.sectionCount,
      sectionPlan: Array.isArray(plan.intent.sectionPlan) ? plan.intent.sectionPlan : null,
      sectionFailures: multi.sectionFailures,
      generationStrategy: args.strategy ?? "quality",
      parallelBatches: multi.parallelBatches,
    }).catch(() => {});

    void enqueueExportJob({
      designId: design.id,
      versionNumber,
      format: "thumbnail",
    }).catch(() => {});

    return {
      designId: design.id,
      versionId: version.id,
      versionNumber,
      finalHtml: multi.finalHtml,
      model: plan.model,
      estimatedTokens,
      totalTokens: multi.totalTokens,
      cachedTokens: multi.cachedTokens,
      costUsd: multi.costUsd,
      generationTimeMs: multi.generationTimeMs,
    };
  }

  const delays = [1000, 3000, 9000];
  let fullHtml = "";
  let finalMessage: any = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      fullHtml = "";
      if (isGeminiPrimaryLlm()) {
        const usageResult = await streamGeminiGeneration({
          system: plan.system,
          max_tokens: plan.maxTokens,
          messages: plan.messages,
          userId: args.userId,
          designId: design.id,
          onText: (textDelta) => {
            fullHtml += textDelta;
            void cb.onChunk?.({ html: textDelta });
          },
        });
        finalMessage = { usage: usageResult.usage };
        break;
      }

      const stream = anthropic.messages.stream({
        model: plan.model as (typeof AI_MODELS)[keyof typeof AI_MODELS],
        system: plan.system,
        max_tokens: plan.maxTokens,
        messages: plan.messages,
        metadata: {
          cache_control: { type: "ephemeral" },
          system_version: PROMPTS.generation.version,
        } as any,
      });

      stream.on("text", (textDelta) => {
        fullHtml += textDelta;
        void cb.onChunk?.({ html: textDelta });
      });
      finalMessage = await stream.finalMessage();
      break;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.response?.status;
      const code = err?.error?.type ?? err?.code;
      const shouldRetry =
        status === 429 ||
        status === 529 ||
        code === "rate_limit_error" ||
        code === "AI_RATE_LIMIT_EXCEEDED" ||
        code === "AI_NETWORK_ERROR" ||
        code === "AI_SERVICE_UNAVAILABLE";
      if (!shouldRetry || attempt === delays.length - 1) break;
      await cb.onStatus?.({
        designId: design.id,
        status: "generating",
        model: plan.model,
        estimatedTokens,
        platform: plan.intent.platform,
        format: String(plan.intent.format),
        dimensions: plan.intent.dimensions,
        message: "Taking longer than expected...",
      });
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  if (!finalMessage) {
    const priorCode = (lastError as any)?.code;
    if (typeof priorCode === "string") {
      const err = new Error(
        String((lastError as any)?.message ?? "AI service unavailable")
      ) as Error & { code?: string; cause?: unknown };
      err.code = priorCode;
      err.cause = lastError;
      throw err;
    }
    const status = (lastError as any)?.status ?? (lastError as any)?.response?.status;
    const err = new Error(
      status === 429 ? "AI provider rate limit exceeded" : "AI service unavailable"
    ) as Error & { code?: string };
    err.code = status === 429 ? "AI_RATE_LIMIT_EXCEEDED" : "AI_SERVICE_UNAVAILABLE";
    throw err;
  }

  const repaired = await postProcessWithEmptyFallback({
    html: fullHtml,
    plan,
    brand: {
      name: brand.name,
      typography: brand.typography as any,
      colors: brand.colors as any,
      logoPrimaryUrl: brand.logoPrimaryUrl ?? null,
    },
    userId,
    designId: design.id,
    userPrompt: remainingPrompt,
    referenceImageUrl: args.referenceImageUrl ?? null,
    referenceIds: (args.referenceIds ?? null) as any,
    trace: args.trace,
    parentRunId: args.parentRunId,
  });

  const placeholderMatches = repaired.html.match(/<img[^>]*data-placeholder="true"[^>]*>/gi) ?? [];
  if (placeholderMatches.length > 0) {
    await cb.onImageStart?.({ imageCount: placeholderMatches.length });
    await cb.onImageComplete?.({ updatedHtml: repaired.html });
  }

  const usage = finalMessage.usage ?? {};
  const cachedTokens = (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const totalTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  const costUsd = computeUsageCostUsd(plan.model, usage);
  logAiCacheSummaryDev({
    stage: "generate",
    model: plan.model,
    usage,
    estimatedTokens,
    promptMeta: (plan as any)?.promptMetadata?.estimatedTokens ?? null,
  });
  const generationTimeMs = Date.now() - start;
  const versionNumber = args.nextVersionNumber ?? 1;

  const version = await prisma.designVersion.create({
    data: {
      designId: design.id,
      versionNumber,
      htmlContent: repaired.html,
      revisionPrompt: null,
      aiModelUsed: plan.model,
      promptTokens: usage.input_tokens ?? null,
      completionTokens: usage.output_tokens ?? null,
      cachedTokens,
      generationTimeMs,
    },
  });

  await prisma.design.update({
    where: { id: design.id },
    data: {
      currentVersion: versionNumber,
      status: "preview",
      updatedAt: new Date(),
    },
  });

  // Learning engine data: store the generation so prompt scoring/preferences can learn.
  void createGenerationLogRecord({
    designId: design.id,
    userId: args.userId,
    brandId,
    platform: plan.intent.platform,
    format: String(plan.intent.format),
    systemPromptVersion: plan.systemPromptVersion,
    templateIdsUsed: plan.templateIdsUsed,
    assembledUserPromptText: plan.assembledUserPromptText,
    system: plan.system,
    fullPromptHash: sha256Hex(`${plan.system}\n\n${plan.assembledUserPromptText}`),
    model: plan.model,
    totalTokens,
    estimatedCostUsd: plan.estimatedCostUsd,
    costUsd,
    revisionCount: 0,
    wasApproved: null,
    testVariantId: plan.testVariantId,
    testAssignments: plan.testAssignments,
    generationTimeMs,
    batchJobId: args.batchJobId,
  }).catch(() => {});

  // Enqueue thumbnail generation (real previews for design library).
  void enqueueExportJob({ designId: design.id, versionNumber, format: "thumbnail" }).catch(() => {});

  return {
    designId: design.id,
    versionId: version.id,
    versionNumber,
    finalHtml: repaired.html,
    model: plan.model,
    estimatedTokens,
    totalTokens,
    cachedTokens,
    costUsd,
    generationTimeMs,
  };
}

type ReviseArgs = {
  userId: string;
  designId: string;
  revisionPrompt: string;
  slideIndex?: number | null;
  referenceImageUrl?: string | null;
  referenceIds?: string[];
  referenceRoles?: Record<string, "layout" | "style" | "color">;
  trace?: TraceContext;
  parentRunId?: string;
};

type StreamReviseArgs = ReviseArgs;
type StreamReviseCallbacks = {
  onChunk?: (payload: { html: string }) => void | Promise<void>;
};

export async function streamReviseDesign(
  args: StreamReviseArgs,
  cb: StreamReviseCallbacks
): Promise<{
  versionId: string;
  html: string;
  model: string;
  versionNumber: number;
  generationTimeMs: number;
}> {
  const { userId, designId, revisionPrompt, slideIndex, referenceImageUrl } = args;
  const startedAt = Date.now();
  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 }, brand: true },
  });
  if (!design || !design.versions[0]) {
    throw new Error("Design not found");
  }

  const current = design.versions[0];

  const resolvedReferenceIds = args.referenceIds ?? (design.referenceIds as string[] | null) ?? [];
  const referenceAnalyses: { referenceId: string; role?: "layout" | "style" | "color"; analysis: any }[] = [];
  for (const id of resolvedReferenceIds) {
    const analysis = await getReferenceAnalysis(id);
    if (!analysis) continue;
    referenceAnalyses.push({ referenceId: id, role: args.referenceRoles?.[id], analysis });
  }

  const revisionReferenceVision = await buildReferenceVisionAttachments(
    userId,
    resolvedReferenceIds,
    referenceImageUrl ?? null
  );

  const normalizeSectionToken = (s: string) => s.toLowerCase().replace(/[_-]/g, " ").trim();
  const shouldTryTargeted =
    (design.platform === "website" || design.platform === "dashboard") &&
    typeof revisionPrompt === "string" &&
    revisionPrompt.trim().length > 0;

  if (shouldTryTargeted) {
    const sectionTypes = extractSectionTypesFromHtml(current.htmlContent ?? "");
    const targetSectionType = detectTargetSectionType(revisionPrompt, sectionTypes);
    const forceTargetedBySize = (current.htmlContent ?? "").length > 100_000;
    const mentionsTarget =
      targetSectionType &&
      normalizeSectionToken(revisionPrompt).includes(normalizeSectionToken(targetSectionType));

    if (targetSectionType && (forceTargetedBySize || mentionsTarget)) {
      await prisma.design.update({
        where: { id: design.id },
        data: { status: "generating" },
      });

      const targeted = await reviseSectionTargeted({
        userId,
        designId,
        currentHtml: current.htmlContent,
        revisionText: revisionPrompt,
        targetSectionType,
        slideIndex: slideIndex ?? null,
        referenceImageUrl: referenceImageUrl ?? null,
      });

      const revised = ensureRevisionRequestedElements({
        html: targeted.revisedHtml.trim() || current.htmlContent,
        revisionPrompt,
        logoUrl: (design.brand as any)?.logoPrimaryUrl ?? null,
        socialHandles: (design.brand as any)?.socialHandles,
      });
      // Emit one chunk for the client preview buffer.
      if (cb.onChunk) {
        await cb.onChunk({ html: revised });
      }
      const saved = await createRevisionVersionAtomically({
        designId: design.id,
        htmlContent: revised,
        revisionPrompt,
        aiModelUsed: targeted.model,
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        generationTimeMs: Date.now() - startedAt,
      });

      void enqueueExportJob({ designId: design.id, versionNumber: saved.versionNumber, format: "thumbnail" }).catch(() => {});

      const pattern = classifyRevision(revisionPrompt);
      await prisma.revisionPattern.create({
        data: {
          userId,
          patternType: pattern.type,
          patternDetail: { revisionPrompt, pattern, slideIndex: slideIndex ?? null },
          frequency: 1,
          designId: design.id,
          isAggregated: false,
        },
      });

      // Track revision count for prompt scoring (revisions before approval).
      void bumpLatestUnapprovedRevisionCount(design.id, userId);

      return {
        versionId: saved.version.id,
        html: revised,
        model: targeted.model,
        versionNumber: saved.versionNumber,
        generationTimeMs: Date.now() - startedAt,
      };
    }
  }

  const { system, messages, pattern } = await assembleRevisionPrompt({
    userId,
    designId,
    currentHtml: current.htmlContent,
    revisionText: revisionPrompt,
    slideIndex,
    slideLabel: design.platform === "mobile" ? "screen" : "slide",
    referenceImageUrl,
    referenceAnalyses,
    referenceImageDataList: revisionReferenceVision,
  });

  await prisma.design.update({
    where: { id: design.id },
    data: { status: "generating" },
  });

  let fullHtml = "";
  let finalMessage: any = null;
  const reviseDelays = [1000, 3000, 9000];
  let reviseLastError: unknown = null;

  for (let attempt = 0; attempt < reviseDelays.length; attempt++) {
    try {
      fullHtml = "";
      if (isGeminiPrimaryLlm()) {
        const usageResult = await streamGeminiGeneration({
          system,
          max_tokens: 8192,
          messages,
          userId,
          designId: design.id,
          onText: (textDelta) => {
            fullHtml += textDelta;
            void cb.onChunk?.({ html: textDelta });
          },
        });
        finalMessage = { usage: usageResult.usage };
        break;
      }

      const stream = anthropic.messages.stream({
        model: AI_MODELS.GENERATOR_SONNET as any,
        system,
        max_tokens: 8192,
        messages,
      });

      stream.on("text", (textDelta) => {
        fullHtml += textDelta;
        void cb.onChunk?.({ html: textDelta });
      });

      finalMessage = await stream.finalMessage();
      break;
    } catch (err: any) {
      reviseLastError = err;
      const status = err?.status ?? err?.response?.status;
      const code = err?.error?.type ?? err?.code;
      const shouldRetry =
        status === 429 ||
        status === 529 ||
        code === "rate_limit_error" ||
        code === "AI_RATE_LIMIT_EXCEEDED" ||
        code === "AI_NETWORK_ERROR" ||
        code === "AI_SERVICE_UNAVAILABLE";
      if (!shouldRetry || attempt === reviseDelays.length - 1) {
        await prisma.design.update({
          where: { id: design.id },
          data: { status: "preview" },
        });
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, reviseDelays[attempt]));
    }
  }

  if (!finalMessage) {
    await prisma.design.update({
      where: { id: design.id },
      data: { status: "preview" },
    });
    const priorCode = (reviseLastError as any)?.code;
    if (typeof priorCode === "string") {
      const err = new Error(
        String((reviseLastError as any)?.message ?? "AI service unavailable")
      ) as Error & { code?: string; cause?: unknown };
      err.code = priorCode;
      err.cause = reviseLastError;
      throw err;
    }
    const status = (reviseLastError as any)?.status ?? (reviseLastError as any)?.response?.status;
    const err = new Error(
      status === 429 ? "AI provider rate limit exceeded" : "AI service unavailable"
    ) as Error & { code?: string };
    err.code = status === 429 ? "AI_RATE_LIMIT_EXCEEDED" : "AI_SERVICE_UNAVAILABLE";
    throw err;
  }

  const revised = ensureRevisionRequestedElements({
    html: fullHtml.trim() || current.htmlContent,
    revisionPrompt,
    logoUrl: (design.brand as any)?.logoPrimaryUrl ?? null,
    socialHandles: (design.brand as any)?.socialHandles,
  });
  const saved = await createRevisionVersionAtomically({
    designId: design.id,
    htmlContent: revised,
    revisionPrompt,
    aiModelUsed: AI_MODELS.GENERATOR_SONNET,
    promptTokens: finalMessage.usage?.input_tokens ?? null,
    completionTokens: finalMessage.usage?.output_tokens ?? null,
    cachedTokens:
      (finalMessage.usage?.cache_read_input_tokens ?? 0) +
      (finalMessage.usage?.cache_creation_input_tokens ?? 0),
    generationTimeMs: Date.now() - startedAt,
  });

  // Enqueue thumbnail generation for the updated version.
  void enqueueExportJob({ designId: design.id, versionNumber: saved.versionNumber, format: "thumbnail" }).catch(() => {});

  await prisma.revisionPattern.create({
    data: {
      userId,
      patternType: pattern.type,
      patternDetail: { revisionPrompt, pattern, slideIndex: slideIndex ?? null },
      frequency: 1,
      designId: design.id,
      isAggregated: false,
    },
  });

  // Track revision count for prompt scoring (revisions before approval).
  void bumpLatestUnapprovedRevisionCount(design.id, userId);

  return {
    versionId: saved.version.id,
    html: revised,
    model: AI_MODELS.GENERATOR_SONNET,
    versionNumber: saved.versionNumber,
    generationTimeMs: Date.now() - startedAt,
  };
}

export async function reviseDesign({
  userId,
  designId,
  revisionPrompt,
  slideIndex,
  referenceImageUrl,
  referenceIds,
  referenceRoles,
}: ReviseArgs): Promise<{
  versionId: string;
  html: string;
  model: string;
  versionNumber: number;
  generationTimeMs: number;
}> {
  const startedAt = Date.now();
  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 }, brand: true },
  });
  if (!design || !design.versions[0]) {
    throw new Error("Design not found");
  }

  const current = design.versions[0];
  const resolvedReferenceIds = referenceIds ?? (design.referenceIds as string[] | null) ?? [];
  const referenceAnalyses: { referenceId: string; role?: "layout" | "style" | "color"; analysis: any }[] = [];
  for (const id of resolvedReferenceIds) {
    const analysis = await getReferenceAnalysis(id);
    if (!analysis) continue;
    referenceAnalyses.push({ referenceId: id, role: referenceRoles?.[id], analysis });
  }

  const nonStreamRevisionVision = await buildReferenceVisionAttachments(
    userId,
    resolvedReferenceIds,
    referenceImageUrl ?? null
  );

  const { system, messages, pattern } = await assembleRevisionPrompt({
    userId,
    designId,
    currentHtml: current.htmlContent,
    revisionText: revisionPrompt,
    slideIndex,
    slideLabel: design.platform === "mobile" ? "screen" : "slide",
    referenceImageUrl,
    referenceAnalyses,
    referenceImageDataList: nonStreamRevisionVision,
  });

  const res = await callAnthropicWithRetry(
    {
      model: AI_MODELS.GENERATOR_SONNET,
      system,
      max_tokens: 2048,
      messages,
    },
    { userId, designId }
  );

  const revised = ensureRevisionRequestedElements({
    html: res.content[0]?.type === "text" ? res.content[0].text.trim() : current.htmlContent,
    revisionPrompt,
    logoUrl: (design.brand as any)?.logoPrimaryUrl ?? null,
    socialHandles: (design.brand as any)?.socialHandles,
  });

  const saved = await createRevisionVersionAtomically({
    designId: design.id,
    htmlContent: revised,
    revisionPrompt,
    aiModelUsed: AI_MODELS.GENERATOR_SONNET,
    promptTokens: res.usage?.input_tokens ?? null,
    completionTokens: res.usage?.output_tokens ?? null,
    cachedTokens:
      (res.usage?.cache_read_input_tokens ?? 0) +
      (res.usage?.cache_creation_input_tokens ?? 0),
    generationTimeMs: Date.now() - startedAt,
  });

  await prisma.revisionPattern.create({
    data: {
      userId,
      patternType: pattern.type,
      patternDetail: { revisionPrompt, pattern, slideIndex: slideIndex ?? null },
      frequency: 1,
      designId: design.id,
      isAggregated: false,
    },
  });

  // Track revision count for prompt scoring (revisions before approval).
  void bumpLatestUnapprovedRevisionCount(design.id, userId);

  return {
    versionId: saved.version.id,
    html: revised,
    model: AI_MODELS.GENERATOR_SONNET,
    versionNumber: saved.versionNumber,
    generationTimeMs: Date.now() - startedAt,
  };
}

