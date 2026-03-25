import Anthropic from "@anthropic-ai/sdk";
import type { Messages } from "@anthropic-ai/sdk/resources";
import { AI_MODELS, AI_PRICING, getPricingForModel } from "@/constants/models";
import { logAIUsage } from "@/lib/ai/usageLogger";
import { callGeminiWithRetry, isGeminiPrimaryLlm } from "@/lib/ai/geminiClient";
import type { TraceContext } from "@/lib/server/langsmith";

const globalForAnthropic = globalThis as unknown as {
  anthropic?: Anthropic;
};

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });

if (process.env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}

type MessageParams = Omit<Anthropic.Messages.MessageCreateParamsNonStreaming, "model"> & {
  model: (typeof AI_MODELS)[keyof typeof AI_MODELS];
  /** Anthropic prompt cache metadata; ignored when using Gemini. */
  metadata?: unknown;
};

function anthropicSystemToOptionalString(params: MessageParams): string | undefined {
  const s = params.system;
  if (s == null) return undefined;
  if (typeof s === "string") return s;
  if (Array.isArray(s)) {
    return s
      .map((b) =>
        b && typeof b === "object" && "type" in b && (b as { type?: string }).type === "text" && "text" in b
          ? String((b as { text?: string }).text ?? "")
          : ""
      )
      .join("\n")
      .trim();
  }
  return undefined;
}

export async function callAnthropicWithRetry(
  params: MessageParams,
  opts: { userId: string; designId?: string | null; trace?: TraceContext; parentRunId?: string }
): Promise<Messages.Message> {
  // Gemini is the only active provider for this test phase.
  if (isGeminiPrimaryLlm()) {
    return callGeminiWithRetry(
      {
        model: params.model,
        system: anthropicSystemToOptionalString(params),
        max_tokens: params.max_tokens,
        messages: params.messages,
      },
      opts
    );
  }

  const delays = [1000, 3000, 9000];

  let lastError: any;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      if (process.env.AI_DEBUG === "true") {
        console.debug("[AI] Request", {
          model: params.model,
          messages: params.messages,
        });
      }

      const res = (await anthropic.messages.create(params as any)) as Messages.Message;

      const usage = res.usage;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const cacheRead = usage?.cache_read_input_tokens ?? 0;
      const cacheWrite = usage?.cache_creation_input_tokens ?? 0;

      const pricing = getPricingForModel(params.model);

      const costInput =
        (inputTokens / 1_000_000) * pricing.inputPerMTokens +
        (cacheWrite / 1_000_000) * pricing.inputPerMTokens +
        (cacheRead / 1_000_000) * pricing.inputPerMTokens * AI_PRICING.CACHE_READ_DISCOUNT;
      const costOutput = (outputTokens / 1_000_000) * pricing.outputPerMTokens;

      await logAIUsage({
        model: params.model,
        userId: opts.userId,
        designId: opts.designId ?? undefined,
        inputTokens,
        outputTokens,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        costUsd: costInput + costOutput,
      });

      return res;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.response?.status;
      const code = err?.error?.type ?? err?.code;

      const shouldRetry = status === 429 || status === 529 || code === "rate_limit_error";
      if (!shouldRetry || attempt === delays.length - 1) {
        const structured = new Error(
          status === 429 ? "AI rate limit exceeded" : "AI service unavailable"
        ) as any;
        structured.code = status === 429 ? "AI_RATE_LIMIT_EXCEEDED" : "AI_SERVICE_UNAVAILABLE";
        structured.cause = err;
        throw structured;
      }

      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  throw lastError;
}

