import { prisma } from "@/lib/db/prisma";
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

  if (process.env.NODE_ENV === "production") {
    try {
      await prisma.generationLog.create({
        data: {
          designId: designId ?? null,
          userId,
          fullPromptHash: "",
          systemPromptVersion: "",
          templateIdsUsed: [],
          brandId: null,
          model,
          totalTokens: inputTokens + outputTokens,
          costUsd,
          revisionCount: 0,
          wasApproved: null,
          sessionDurationMs: null,
        },
      });
    } catch (err) {
      console.error("Failed to log AI usage", err);
    }
  }
}

