/** Logical names; when using Gemini (`GEMINI_API_KEY`), all map to the same Gemini 2.5 Flash model id. */
export const GEMINI_FLASH_MODEL_ID = "gemini-2.5-flash";

export const AI_MODELS = {
  ROUTER_HAIKU: GEMINI_FLASH_MODEL_ID,
  GENERATOR_SONNET: GEMINI_FLASH_MODEL_ID,
  FALLBACK_OPUS: GEMINI_FLASH_MODEL_ID,
} as const;

/** Rough $/1M tokens for cost hints (Gemini 2.5 Flash–class; tune as needed). */
export const AI_PRICING = {
  HAIKU: {
    inputPerMTokens: 0.15,
    outputPerMTokens: 0.6,
  },
  SONNET: {
    inputPerMTokens: 0.15,
    outputPerMTokens: 0.6,
  },
  /** Used for Gemini Flash logging / estimates when `GEMINI_API_KEY` is primary. */
  GEMINI_FLASH: {
    inputPerMTokens: 0.15,
    outputPerMTokens: 0.6,
  },
  CACHE_READ_DISCOUNT: 0.1,
} as const;

/** Token pricing for cost estimates / logging (Gemini vs Anthropic logical models). */
export function getPricingForModel(model: string) {
  if (model.includes("gemini")) return AI_PRICING.GEMINI_FLASH;
  return model === AI_MODELS.ROUTER_HAIKU ? AI_PRICING.HAIKU : AI_PRICING.SONNET;
}

