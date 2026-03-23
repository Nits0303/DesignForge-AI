import type { Platform } from "@/types/design";

// Chart colors must be consistent across the analytics UI.
// We primarily lean on existing design tokens, and fall back to fixed HSL values where needed.
export const PLATFORM_COLOR_MAP: Record<Platform, string> = {
  instagram: "var(--accent-primary)",
  linkedin: "hsl(192 55% 55% / 1)",
  facebook: "hsl(142 55% 45% / 1)",
  twitter: "hsl(212 70% 62% / 1)",
  website: "hsl(280 55% 60% / 1)",
  mobile: "hsl(38 85% 55% / 1)",
  dashboard: "hsl(260 60% 60% / 1)",
};

