import type { ParsedIntent, PromptMetadata } from "@/types/ai";
import { AI_MODELS, AI_PRICING } from "@/constants/models";

export function chooseModel(intent: ParsedIntent, meta: PromptMetadata): {
  model: string;
  maxTokens: number;
  estimatedCostUsd: number;
} {
  const baseTokens =
    meta.estimatedTokens.system +
    meta.estimatedTokens.components +
    meta.estimatedTokens.brand +
    meta.estimatedTokens.request;

  const complexity = intent.complexity ?? "moderate";

  const targetTokens =
    complexity === "simple" ? 1024 : complexity === "complex" ? 4096 : 2048;

  const model =
    complexity === "complex" || baseTokens + targetTokens > 6000
      ? AI_MODELS.FALLBACK_OPUS
      : AI_MODELS.GENERATOR_SONNET;

  const pricing = AI_PRICING.SONNET;

  const estInput = baseTokens + targetTokens;
  const estOutput = targetTokens;

  const costInput = (estInput / 1_000_000) * pricing.inputPerMTokens;
  const costOutput = (estOutput / 1_000_000) * pricing.outputPerMTokens;

  const estimatedCostUsd = costInput + costOutput;

  return {
    model,
    maxTokens: targetTokens,
    estimatedCostUsd,
  };
}

