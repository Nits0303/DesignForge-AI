export const AI_MODELS = {
  ROUTER_HAIKU: "claude-3-5-haiku-latest",
  GENERATOR_SONNET: "claude-3-7-sonnet-latest",
  FALLBACK_OPUS: "claude-3-opus-latest",
} as const;

export const AI_PRICING = {
  HAIKU: {
    inputPerMTokens: 1,
    outputPerMTokens: 5,
  },
  SONNET: {
    inputPerMTokens: 3,
    outputPerMTokens: 15,
  },
  CACHE_READ_DISCOUNT: 0.1,
} as const;

