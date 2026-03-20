import type { Platform } from "@/types/design";

export const REVISION_SUGGESTIONS: Partial<Record<Platform, string[]>> = {
  instagram: [
    "Make the heading larger and bolder",
    "Use a darker background color",
    "Add more white space around elements",
    "Make the CTA button more prominent",
    "Adjust colors to feel warmer and more vibrant",
    "Increase contrast between text and background",
  ],
  linkedin: [
    "Make it feel more professional and corporate",
    "Increase font size for better readability",
    "Add a subtle border or card shadow",
    "Make the headline more prominent",
    "Use a more muted, professional color palette",
  ],
  twitter: [
    "Make text punchier and reduce word count",
    "Increase contrast for better visibility",
    "Make the layout more compact",
    "Add a bold accent color to the CTA",
    "Simplify the design – remove one element",
  ],
  facebook: [
    "Make it more eye-catching for a feed",
    "Increase the size of key text",
    "Add a colorful banner or overlay",
    "Make the CTA clearer and larger",
    "Brighten the overall color palette",
  ],
  website: [
    "Add more breathing room between sections",
    "Make the hero heading much larger",
    "Improve the CTA button contrast",
    "Add a subtle gradient background",
    "Make the layout feel less cluttered",
    "Increase font size for body text",
  ],
  dashboard: [
    "Make the chart colors more distinct",
    "Increase table row padding for readability",
    "Add card shadows to separate sections",
    "Reduce visual noise in the sidebar",
    "Make the primary metric stand out more",
  ],
  mobile: [
    "Increase tap target sizes for buttons",
    "Improve bottom navigation visibility",
    "Add more padding around content",
    "Make headings larger for small screens",
    "Simplify the layout for one-thumb navigation",
  ],
};

export const DEFAULT_REVISION_SUGGESTIONS = [
  "Make the heading larger and bolder",
  "Use a darker background color",
  "Add more white space around elements",
  "Make the CTA button more prominent",
  "Increase contrast between text and background",
];
