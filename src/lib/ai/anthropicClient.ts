import Anthropic from "@anthropic-ai/sdk";
import type { Messages } from "@anthropic-ai/sdk/resources";
import { AI_MODELS, AI_PRICING } from "@/constants/models";
import { logAIUsage } from "@/lib/ai/usageLogger";

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
};

export async function callAnthropicWithRetry(
  params: MessageParams,
  opts: { userId: string; designId?: string | null }
): Promise<Messages.Message> {
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

      const res = await anthropic.messages.create(params);

      const usage = res.usage;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const cacheRead = usage?.cache_read_input_tokens ?? 0;
      const cacheWrite = usage?.cache_creation_input_tokens ?? 0;

      const pricing =
        params.model === AI_MODELS.ROUTER_HAIKU ? AI_PRICING.HAIKU : AI_PRICING.SONNET;

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

