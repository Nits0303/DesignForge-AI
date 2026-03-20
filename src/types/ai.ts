import type { DesignFormat, Platform } from "@/types/design";

export type ParsedIntent = {
  platform: Platform;
  format: DesignFormat | string;
  dimensions:
    | { width: number; height: number | "auto" }
    | { width: number; height: number | "auto" }[];
  slideCount?: number;
  screenCount?: number;
  /**
   * Ordered list of section type strings for website/dashboard generation.
   * Example: ["navbar","hero","social_proof","features","pricing","footer"]
   */
  sectionPlan?: string[];
  styleContext?: string[];
  contentRequirements?: string[];
  requiresImageGeneration?: boolean;
  suggestedTemplateTags?: string[];
  designMood?: "minimal" | "bold" | "playful" | "corporate" | "elegant" | "technical";
  colorPreference?: "light" | "dark" | "colorful" | "monochrome" | "brand";
  complexity?: "simple" | "moderate" | "complex";
};

export type PromptAssemblyContext = {
  brandId?: string;
  templateIds?: string[];
  platform: Platform;
  format: DesignFormat;
};

export type GenerationRequest = {
  prompt: string;
  context: PromptAssemblyContext;
};

export type GenerationResponse = {
  html: string;
  model: string;
  tokensUsed?: number;
};

export type RevisionRequest = {
  designId: string;
  revisionPrompt: string;
};

export type SmartRouterOutput = {
  selectedModel: "haiku" | "sonnet" | "opus";
  reason: string;
};

export type PromptMetadata = {
  systemVersion: string;
  estimatedTokens: {
    system: number;
    components: number;
    brand: number;
    preferences: number;
    request: number;
  };
  templateIds: string[];
  cacheLikely: boolean;
  model?: string;
  estimatedCostUsd?: number;
};

export type ReferenceAnalysis = {
  layoutStructure: {
    type:
      | "single_column"
      | "two_column"
      | "three_column"
      | "grid"
      | "hero_split"
      | "sidebar"
      | "card_grid"
      | "full_bleed";
    sections: string[];
    hasNavbar: boolean;
    hasSidebar: boolean;
    hasHero: boolean;
    contentDensity: "sparse" | "moderate" | "dense";
    alignment: "left" | "center" | "mixed";
  };
  colorPalette: {
    dominant: string;
    background: string;
    text: string;
    accent: string;
    isDark: boolean;
    colorTemperature: "warm" | "cool" | "neutral";
    saturation: "muted" | "moderate" | "vibrant";
    paletteDescription: string;
  };
  typography: {
    headingStyle: "serif" | "sans-serif" | "display" | "monospace";
    bodyStyle: "serif" | "sans-serif";
    sizeScale: "compact" | "comfortable" | "large";
    weightStyle: "light" | "regular" | "bold" | "mixed";
    typographyDescription: string;
  };
  spacing: {
    density: "tight" | "comfortable" | "spacious";
    sectionPadding: "minimal" | "moderate" | "generous";
    componentSpacing: "tight" | "balanced" | "airy";
  };
  visualStyle: {
    mood:
      | "minimal"
      | "bold"
      | "playful"
      | "corporate"
      | "elegant"
      | "technical"
      | "warm"
      | "futuristic";
    hasGradients: boolean;
    hasShadows: boolean;
    hasIllustrations: boolean;
    hasPhotography: boolean;
    borderRadius: "sharp" | "slight" | "rounded" | "pill";
    hasPatterns: boolean;
    styleKeywords: string[];
  };
  components: {
    detected: string[];
    ctaStyle: "button" | "link" | "banner" | "form" | "none";
    cardStyle: "flat" | "bordered" | "shadowed" | "glassmorphism" | "none";
    navigationStyle: "horizontal_top" | "vertical_sidebar" | "hamburger" | "tabs" | "none";
  };
  platform: {
    detectedType: "website" | "mobile_app" | "dashboard" | "social_media" | "email" | "unknown";
    suggestedShortcode: string;
  };
  overallDescription: string;
  contentRejected?: boolean;
  analyzedAt?: string;
  fromCache?: boolean;
};

