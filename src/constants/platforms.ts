import type { Platform } from "@/types/design";
import { DEFAULT_MOBILE_DEVICE_ID, MOBILE_DEVICE_PRESETS } from "@/constants/mobileDevices";

export type SocialDimensionId = "square" | "portrait" | "landscape";
export type SocialDimensionPreset = {
  id: SocialDimensionId;
  label: string;
  width: number;
  height: number;
  ratio: "1:1" | "4:5" | "16:9";
  description: string;
  platforms: Platform[];
  isDefault?: boolean;
};

export const SOCIAL_DIMENSIONS: SocialDimensionPreset[] = [
  {
    id: "square",
    label: "Square",
    width: 1080,
    height: 1080,
    ratio: "1:1",
    description: "Universal format — works on all social platforms",
    platforms: ["instagram", "linkedin", "facebook", "twitter"],
  },
  {
    id: "portrait",
    label: "Portrait",
    width: 1080,
    height: 1350,
    ratio: "4:5",
    description: "Max vertical space — best for feed engagement on Instagram & LinkedIn",
    platforms: ["instagram", "linkedin"],
  },
  {
    id: "landscape",
    label: "Landscape",
    width: 1200,
    height: 675,
    ratio: "16:9",
    description: "Wide format — covers LinkedIn, Facebook, and Twitter",
    platforms: ["linkedin", "facebook", "twitter"],
    isDefault: true,
  },
] as const;

export const DEFAULT_SOCIAL_DIMENSION = SOCIAL_DIMENSIONS.find((d) => d.isDefault)!;

type PlatformSpec = {
  displayName: string;
  supportedFormats: string[];
  defaultDimensions: Record<string, { width: number; height: number | "auto" }>;
  /** For social platforms, shared selectable presets for `post` generation. */
  dimensions?: SocialDimensionPreset[];
};

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  instagram: {
    displayName: "Instagram",
    supportedFormats: ["post", "story"],
    defaultDimensions: {
      // Social "post" uses shared presets; default remains Landscape unless user overrides.
      post: { width: DEFAULT_SOCIAL_DIMENSION.width, height: DEFAULT_SOCIAL_DIMENSION.height },
      story: { width: 1080, height: 1920 },
    },
    dimensions: SOCIAL_DIMENSIONS as unknown as SocialDimensionPreset[],
  },
  linkedin: {
    displayName: "LinkedIn",
    supportedFormats: ["post", "banner"],
    defaultDimensions: {
      post: { width: DEFAULT_SOCIAL_DIMENSION.width, height: DEFAULT_SOCIAL_DIMENSION.height },
      banner: { width: 1584, height: 396 },
    },
    dimensions: SOCIAL_DIMENSIONS as unknown as SocialDimensionPreset[],
  },
  facebook: {
    displayName: "Facebook",
    supportedFormats: ["post", "story"],
    defaultDimensions: {
      post: { width: DEFAULT_SOCIAL_DIMENSION.width, height: DEFAULT_SOCIAL_DIMENSION.height },
      story: { width: 1080, height: 1920 },
    },
    dimensions: SOCIAL_DIMENSIONS as unknown as SocialDimensionPreset[],
  },
  twitter: {
    displayName: "Twitter/X",
    supportedFormats: ["post", "banner"],
    defaultDimensions: {
      post: { width: DEFAULT_SOCIAL_DIMENSION.width, height: DEFAULT_SOCIAL_DIMENSION.height },
      banner: { width: 1500, height: 500 },
    },
    dimensions: SOCIAL_DIMENSIONS as unknown as SocialDimensionPreset[],
  },
  website: {
    displayName: "Website",
    supportedFormats: [
      "landing_page",
      "hero_section",
      "features_section",
      "pricing_section",
      "about_page",
      "contact_page",
      "blog_page",
      "coming_soon",
    ],
    defaultDimensions: {
      landing_page: { width: 1440, height: "auto" as any },
      hero_section: { width: 1440, height: "auto" as any },
      features_section: { width: 1440, height: "auto" as any },
      pricing_section: { width: 1440, height: "auto" as any },
      about_page: { width: 1440, height: "auto" as any },
      contact_page: { width: 1440, height: "auto" as any },
      blog_page: { width: 1440, height: "auto" as any },
      coming_soon: { width: 1440, height: "auto" as any },
    },
  },
  mobile: {
    displayName: "Mobile App UI",
    supportedFormats: [
      "onboarding_flow",
      "home_feed",
      "profile_screen",
      "settings_screen",
      "auth_flow",
      "product_detail",
      "checkout_flow",
      "search_screen",
      "notification_screen",
      "empty_state",
      "dashboard_screen",
      "map_screen",
      "chat_screen",
      "media_player",
      "screen", // legacy single-screen alias
    ],
    defaultDimensions: (() => {
      const d = MOBILE_DEVICE_PRESETS[DEFAULT_MOBILE_DEVICE_ID];
      const base = { width: d.width, height: d.height } as const;
      const entries = [
        "onboarding_flow",
        "home_feed",
        "profile_screen",
        "settings_screen",
        "auth_flow",
        "product_detail",
        "checkout_flow",
        "search_screen",
        "notification_screen",
        "empty_state",
        "dashboard_screen",
        "map_screen",
        "chat_screen",
        "media_player",
        "screen",
      ];
      return Object.fromEntries(entries.map((k) => [k, base])) as Record<
        string,
        { width: number; height: number | "auto" }
      >;
    })(),
  },
  dashboard: {
    displayName: "Dashboard",
    supportedFormats: [
      "analytics_dashboard",
      "admin_panel",
      "settings_page",
      "data_table",
      "user_management",
    ],
    defaultDimensions: {
      analytics_dashboard: { width: 1440, height: "auto" as any },
      admin_panel: { width: 1440, height: "auto" as any },
      settings_page: { width: 1440, height: "auto" as any },
      data_table: { width: 1440, height: "auto" as any },
      user_management: { width: 1440, height: "auto" as any },
    },
  },
};

