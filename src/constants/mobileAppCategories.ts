/**
 * App category style guidance for mobile generation (Sprint 14).
 */

export type MobileAppCategory =
  | "social"
  | "ecommerce"
  | "productivity"
  | "health"
  | "finance"
  | "entertainment"
  | "other";

export type MobileCategoryStyleNotes = {
  category: MobileAppCategory;
  colorTemperature: "vibrant" | "conservative" | "neutral" | "warm" | "cool";
  illustrationStyle: string;
  density: "sparse" | "moderate" | "dense";
  mustHaveUi: string[];
  styleNotes: string;
};

export const MOBILE_APP_CATEGORY_STYLES: Record<MobileAppCategory, MobileCategoryStyleNotes> = {
  social: {
    category: "social",
    colorTemperature: "vibrant",
    illustrationStyle: "Photography and bold imagery; avatars and stories row.",
    density: "moderate",
    mustHaveUi: ["Stories/highlights row", "Feed cards", "Engagement actions"],
    styleNotes: "Prefer vibrant colors, bold imagery, social proof elements.",
  },
  ecommerce: {
    category: "ecommerce",
    colorTemperature: "neutral",
    illustrationStyle: "Product photography; clear pricing.",
    density: "dense",
    mustHaveUi: ["Product images", "Prices", "Add to cart / checkout path"],
    styleNotes: "High information density; product images and prices must be prominent.",
  },
  productivity: {
    category: "productivity",
    colorTemperature: "cool",
    illustrationStyle: "Icons, lists, KPIs.",
    density: "moderate",
    mustHaveUi: ["Task/list patterns", "Quick actions", "Progress indicators"],
    styleNotes: "Clean hierarchy; focus on clarity and task completion.",
  },
  health: {
    category: "health",
    colorTemperature: "warm",
    illustrationStyle: "Friendly illustrations and soft gradients.",
    density: "sparse",
    mustHaveUi: ["Progress rings or charts", "Gentle CTAs"],
    styleNotes: "Spacious layouts; reassuring tone.",
  },
  finance: {
    category: "finance",
    colorTemperature: "conservative",
    illustrationStyle: "Charts, icons, minimal ornament.",
    density: "moderate",
    mustHaveUi: ["Balances / KPIs", "Secure patterns"],
    styleNotes: "Conservative palette; emphasize trust and clarity.",
  },
  entertainment: {
    category: "entertainment",
    colorTemperature: "vibrant",
    illustrationStyle: "Rich media, posters, hero art.",
    density: "moderate",
    mustHaveUi: ["Hero media", "Play/continue CTAs"],
    styleNotes: "Immersive visuals; strong focal content.",
  },
  other: {
    category: "other",
    colorTemperature: "neutral",
    illustrationStyle: "Balanced imagery and iconography.",
    density: "moderate",
    mustHaveUi: [],
    styleNotes: "Use brand-forward styling with clear hierarchy.",
  },
};
