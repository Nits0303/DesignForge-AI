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
import { getReferenceAnalysis } from "@/lib/ai/referenceAnalyzer";
import { computePromptStructureHash } from "@/lib/learning/hashUtils";
import {
  resolveAbTestsForGeneration,
  type MergedAbPromptContext,
  type TestAssignmentEntry,
} from "@/lib/ab/abTestAssignment";
import { getCurrentDefaultVersionKey } from "@/lib/ai/prompts/promptVersionRegistry";
import { getPlatformAdditionalInstruction, getPlatformTemplateSelectionDefaults } from "@/lib/db/platformDefaults";

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
};

async function planGeneration({
  userId,
  brandId,
  projectId,
  prompt,
  referenceImageUrl,
  referenceIds,
  referenceRoles,
  sectionPlanOverride,
}: GenerateArgs): Promise<{ plan: PlanResult; remainingPrompt: string; estimatedTokens: number }> {
  const shortcode = parseShortcode(prompt);
  const remainingPrompt = shortcode?.remainingPrompt ?? prompt;
  const partialFromShortcode = shortcode ? shortcodeToPartialIntent(shortcode) : {};
  if (sectionPlanOverride && Array.isArray(sectionPlanOverride)) {
    (partialFromShortcode as any).sectionPlan = sectionPlanOverride;
  }

  const routed: ParsedIntent = await smartRouteIntent({
    userId,
    prompt: remainingPrompt,
    partialIntent: partialFromShortcode as ParsedIntent,
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

  const templates = await selectTemplatesForIntent(routed, {
    userId,
    templateSelectionStrategy,
    approvalRateMultiplier,
  });

  const references: { referenceId: string; role?: "layout" | "style" | "color"; analysis: any }[] = [];
  for (const id of referenceIds ?? []) {
    const analysis = await getReferenceAnalysis(id);
    if (!analysis) continue;
    references.push({ referenceId: id, role: referenceRoles?.[id], analysis });
  }

  const { system, messages, metadata } = await assembleGenerationPrompt({
    userId,
    brandId,
    intent: routed,
    templates,
    userPrompt: remainingPrompt,
    referenceImageUrl,
    referenceAnalyses: references,
    resolvedSystemVersionKey,
    abVariantContext: abMerged,
  });

  const { model, maxTokens, estimatedCostUsd } = chooseModel(routed, metadata);

  const assembledUserPromptText =
    messages?.[0]?.content?.[0]?.text != null ? String(messages[0].content[0].text) : "";

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

async function postProcessWithEmptyFallback(args: {
  html: string;
  plan: PlanResult;
  brand: { name: string; typography: any; colors: any };
  userId: string;
  designId: string;
  userPrompt: string;
}): Promise<{ html: string; warnings: string[] }> {
  const attemptPostProcess = async (candidateHtml: string) =>
    postProcessHtml({
      html: candidateHtml.trim(),
      intent: args.plan.intent,
      brand: args.brand,
      abModifiers: {
        headlineSizeMultiplier: args.plan.abMergedContext?.headlineSizeModifier,
        spacingMultiplier: args.plan.abMergedContext?.spacingModifier,
      },
      repairMalformedHtml: async (malformedHtml) => {
        const repairResponse = await callAnthropicWithRetry(
          {
            model: AI_MODELS.GENERATOR_SONNET,
            system:
              "The following HTML is malformed. Fix the structural issues and return the corrected complete HTML.",
            max_tokens: args.plan.maxTokens,
            messages: [{ role: "user", content: [{ type: "text", text: malformedHtml }] }],
          },
          { userId: args.userId, designId: args.designId }
        );
        return repairResponse.content[0]?.type === "text"
          ? repairResponse.content[0].text.trim()
          : malformedHtml;
      },
    });

  try {
    return await attemptPostProcess(args.html);
  } catch (err: any) {
    if (err?.code !== "GENERATION_EMPTY_HTML" && err?.code !== "GENERATION_INVALID_HTML") throw err;
  }

  const retryResponse = await callAnthropicWithRetry(
    {
      model: AI_MODELS.GENERATOR_SONNET,
      system:
        "You are a senior web UI designer. Return ONLY complete HTML (no markdown). Build a real, populated full-bleed poster layout with visible hierarchy and CTA elements. Avoid empty wrappers. Use inline styles and utility classes. Ensure the design fills the entire canvas (no large outer margins).",
      max_tokens: args.plan.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `The previous generation was empty/too thin and failed validation.\n` +
                `Regenerate from scratch with richer visible content.\n\n` +
                `INTENT JSON:\n${JSON.stringify(args.plan.intent, null, 2)}\n\n` +
                `USER REQUEST:\n${args.plan.assembledUserPromptText}\n\n` +
                `Return only complete HTML.`,
            },
          ],
        },
      ],
    },
    { userId: args.userId, designId: args.designId }
  );

  const retryHtml =
    retryResponse.content[0]?.type === "text" ? retryResponse.content[0].text.trim() : "";
  try {
    if (!retryHtml) throw Object.assign(new Error("Empty retry"), { code: "GENERATION_EMPTY_HTML" });
    return await attemptPostProcess(retryHtml);
  } catch (err: any) {
    if (err?.code !== "GENERATION_EMPTY_HTML" && err?.code !== "GENERATION_INVALID_HTML") throw err;
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
  <body style="margin:0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:${bg}; color:${fg}; width:${canvasW}px; height:${canvasH}px; overflow:hidden;">
    <main style="width:100%; height:100%; box-sizing:border-box; padding:22px; display:grid; grid-template-rows:auto 1fr auto; background:
      radial-gradient(1200px 700px at 90% -10%, rgba(255,255,255,0.12), transparent 50%),
      linear-gradient(135deg, ${bg} 0%, #1f2937 100%);">
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
    </main>
  </body>
</html>`;

  return attemptPostProcess(fallbackHtml);
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
    },
    userId,
    designId: design.id,
    userPrompt: remainingPrompt,
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
    },
    userId,
    designId: design.id,
    userPrompt: remainingPrompt,
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
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
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

      // Emit one chunk for the client preview buffer.
      if (cb.onChunk) {
        await cb.onChunk({ html: targeted.revisedHtml });
      }

      const revised = targeted.revisedHtml.trim() || current.htmlContent;
      const nextVersion = design.currentVersion + 1;

      const version = await prisma.designVersion.create({
        data: {
          designId: design.id,
          versionNumber: nextVersion,
          htmlContent: revised,
          revisionPrompt,
          aiModelUsed: targeted.model,
          promptTokens: null,
          completionTokens: null,
          cachedTokens: null,
          generationTimeMs: Date.now() - startedAt,
        },
      });

      await prisma.design.update({
        where: { id: design.id },
        data: { currentVersion: nextVersion, status: "preview" },
      });

      void enqueueExportJob({ designId: design.id, versionNumber: nextVersion, format: "thumbnail" }).catch(() => {});

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
        versionId: version.id,
        html: revised,
        model: targeted.model,
        versionNumber: nextVersion,
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
    const status = (reviseLastError as any)?.status ?? (reviseLastError as any)?.response?.status;
    const err = new Error(
      status === 429 ? "AI provider rate limit exceeded" : "AI service unavailable"
    ) as Error & { code?: string };
    err.code = status === 429 ? "AI_RATE_LIMIT_EXCEEDED" : "AI_SERVICE_UNAVAILABLE";
    throw err;
  }

  const revised = fullHtml.trim() || current.htmlContent;
  const nextVersion = design.currentVersion + 1;

  const version = await prisma.designVersion.create({
    data: {
      designId: design.id,
      versionNumber: nextVersion,
      htmlContent: revised,
      revisionPrompt,
      aiModelUsed: AI_MODELS.GENERATOR_SONNET,
      promptTokens: finalMessage.usage?.input_tokens ?? null,
      completionTokens: finalMessage.usage?.output_tokens ?? null,
      cachedTokens:
        (finalMessage.usage?.cache_read_input_tokens ?? 0) +
        (finalMessage.usage?.cache_creation_input_tokens ?? 0),
      generationTimeMs: Date.now() - startedAt,
    },
  });

  await prisma.design.update({
    where: { id: design.id },
    data: { currentVersion: nextVersion, status: "preview" },
  });

  // Enqueue thumbnail generation for the updated version.
  void enqueueExportJob({ designId: design.id, versionNumber: nextVersion, format: "thumbnail" }).catch(() => {});

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
    versionId: version.id,
    html: revised,
    model: AI_MODELS.GENERATOR_SONNET,
    versionNumber: nextVersion,
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
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
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

  const { system, messages, pattern } = await assembleRevisionPrompt({
    userId,
    designId,
    currentHtml: current.htmlContent,
    revisionText: revisionPrompt,
    slideIndex,
    slideLabel: design.platform === "mobile" ? "screen" : "slide",
    referenceImageUrl,
    referenceAnalyses,
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

  const revised = res.content[0]?.type === "text" ? res.content[0].text.trim() : current.htmlContent;

  const nextVersion = design.currentVersion + 1;

  const version = await prisma.designVersion.create({
    data: {
      designId: design.id,
      versionNumber: nextVersion,
      htmlContent: revised,
      revisionPrompt,
      aiModelUsed: AI_MODELS.GENERATOR_SONNET,
      promptTokens: res.usage?.input_tokens ?? null,
      completionTokens: res.usage?.output_tokens ?? null,
      cachedTokens:
        (res.usage?.cache_read_input_tokens ?? 0) +
        (res.usage?.cache_creation_input_tokens ?? 0),
      generationTimeMs: Date.now() - startedAt,
    },
  });

  await prisma.design.update({
    where: { id: design.id },
    data: {
      currentVersion: nextVersion,
      status: "preview",
    },
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
    versionId: version.id,
    html: revised,
    model: AI_MODELS.GENERATOR_SONNET,
    versionNumber: nextVersion,
    generationTimeMs: Date.now() - startedAt,
  };
}

