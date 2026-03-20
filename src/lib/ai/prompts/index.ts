import { SMART_ROUTER_PROMPT_VERSION, SMART_ROUTER_SYSTEM_PROMPT } from "./smartRouterSystemPrompt";
import { GENERATION_PROMPT_VERSION, GENERATION_SYSTEM_PROMPT } from "./generationSystemPrompt";
import { REVISION_PROMPT_VERSION, REVISION_SYSTEM_PROMPT } from "./revisionSystemPrompt";
import {
  REFERENCE_ANALYSIS_PROMPT_VERSION,
  REFERENCE_ANALYSIS_SYSTEM_PROMPT,
} from "./referenceAnalysisPrompt";

export const PROMPTS = {
  smartRouter: {
    version: SMART_ROUTER_PROMPT_VERSION,
    system: SMART_ROUTER_SYSTEM_PROMPT,
  },
  generation: {
    version: GENERATION_PROMPT_VERSION,
    system: GENERATION_SYSTEM_PROMPT,
  },
  revision: {
    version: REVISION_PROMPT_VERSION,
    system: REVISION_SYSTEM_PROMPT,
  },
  referenceAnalysis: {
    version: REFERENCE_ANALYSIS_PROMPT_VERSION,
    system: REFERENCE_ANALYSIS_SYSTEM_PROMPT,
  },
} as const;

