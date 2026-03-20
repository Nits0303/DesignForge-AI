import { prisma } from "@/lib/db/prisma";
import { parseShortcode, shortcodeToPartialIntent } from "@/lib/ai/shortcodeParser";
import { smartRouteIntent } from "@/lib/ai/smartRouter";
import { selectTemplatesForIntent } from "@/lib/ai/componentSelector";
import { assembleGenerationPrompt } from "@/lib/ai/promptAssembler";
import { chooseModel } from "@/lib/ai/modelRouter";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { anthropic } from "@/lib/ai/anthropicClient";
import { PROMPTS } from "@/lib/ai/prompts";
import { AI_MODELS, AI_PRICING } from "@/constants/models";
import type { ParsedIntent } from "@/types/ai";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { assembleRevisionPrompt } from "@/lib/ai/revisionPromptAssembler";
import { classifyRevision } from "@/lib/ai/revisionClassifier";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";
import { generateMultiSectionHtml } from "@/lib/ai/multiSectionGenerator";
import {
  detectTargetSectionType,
  extractSectionTypesFromHtml,
  reviseSectionTargeted,
} from "@/lib/ai/sectionTargetedRevisor";
import { getReferenceAnalysis } from "@/lib/ai/referenceAnalyzer";

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
};

type PlanResult = {
  intent: ParsedIntent;
  templates: { id: string; htmlSnippet: string; tags: string[] }[];
  system: string;
  messages: any;
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

  const templates = await selectTemplatesForIntent(routed);

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
  });

  const { model, maxTokens, estimatedCostUsd } = chooseModel(routed, metadata);

  return {
    plan: {
      intent: routed,
      templates,
      system,
      messages,
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

function getModelPricing(model: string) {
  return model === AI_MODELS.ROUTER_HAIKU ? AI_PRICING.HAIKU : AI_PRICING.SONNET;
}

function computeUsageCostUsd(model: string, usage: any): number {
  const pricing = getModelPricing(model);
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

    // Store multi-section analytics for website/dashboard generations.
    void prisma.generationLog
      .create({
        data: {
          designId: design.id,
          userId: args.userId,
          fullPromptHash: "",
          systemPromptVersion: PROMPTS.generation?.version ?? "",
          templateIdsUsed: [],
          brandId,
          model: plan.model,
          totalTokens: multi.totalTokens,
          costUsd: multi.costUsd,
          sectionCount: multi.sectionCount,
          sectionPlan: Array.isArray(plan.intent.sectionPlan) ? plan.intent.sectionPlan : null,
          sectionFailures: multi.sectionFailures,
          generationStrategy: args.strategy ?? "quality",
          parallelBatches: multi.parallelBatches,
        } as any,
      })
      .catch(() => {});

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
      const shouldRetry = status === 429 || status === 529 || code === "rate_limit_error";
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

  const repaired = await postProcessHtml({
    html: fullHtml.trim(),
    intent: plan.intent,
    brand,
    repairMalformedHtml: async (malformedHtml) => {
      const repairResponse = await callAnthropicWithRetry(
        {
          model: AI_MODELS.GENERATOR_SONNET,
          system:
            "The following HTML is malformed. Fix the structural issues and return the corrected complete HTML.",
          max_tokens: plan.maxTokens,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: malformedHtml }],
            },
          ],
        },
        { userId, designId: design.id }
      );
      return repairResponse.content[0]?.type === "text"
        ? repairResponse.content[0].text.trim()
        : malformedHtml;
    },
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
        },
      });

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

  try {
    finalMessage = await stream.finalMessage();
  } catch (err: any) {
    await prisma.design.update({
      where: { id: design.id },
      data: { status: "preview" },
    });
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
    },
  });

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
    },
  });

  return {
    versionId: version.id,
    html: revised,
    model: AI_MODELS.GENERATOR_SONNET,
    versionNumber: nextVersion,
    generationTimeMs: Date.now() - startedAt,
  };
}

