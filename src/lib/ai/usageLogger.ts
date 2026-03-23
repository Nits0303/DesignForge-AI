import { AI_MODELS } from "@/constants/models";

type Params = {
  model: (typeof AI_MODELS)[keyof typeof AI_MODELS] | string;
  userId: string;
  designId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
};

export async function logAIUsage({
  model,
  userId,
  designId,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  costUsd,
}: Params) {
  if (process.env.NODE_ENV !== "production" || process.env.AI_DEBUG === "true") {
    console.log("[AI usage]", {
      model,
      userId,
      designId,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd,
    });
  }
  // Learning engine data collection happens in generation/revision/approve/export flows.
  // This helper only logs usage details to stdout to avoid writing incomplete GenerationLog rows.
}

