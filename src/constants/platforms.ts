import type { Platform } from "@/types/design";
import { DEFAULT_MOBILE_DEVICE_ID, MOBILE_DEVICE_PRESETS } from "@/constants/mobileDevices";

type PlatformSpec = {
  displayName: string;
  supportedFormats: string[];
  defaultDimensions: Record<string, { width: number; height: number | "auto" }>;
};

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  instagram: {
    displayName: "Instagram",
    supportedFormats: ["post", "story"],
    defaultDimensions: {
      post: { width: 1080, height: 1080 },
      story: { width: 1080, height: 1920 },
    },
  },
  linkedin: {
    displayName: "LinkedIn",
    supportedFormats: ["post", "banner"],
    defaultDimensions: {
      post: { width: 1200, height: 627 },
      banner: { width: 1584, height: 396 },
    },
  },
  facebook: {
    displayName: "Facebook",
    supportedFormats: ["post", "story"],
    defaultDimensions: {
      post: { width: 1200, height: 630 },
      story: { width: 1080, height: 1920 },
    },
  },
  twitter: {
    displayName: "Twitter/X",
    supportedFormats: ["post", "banner"],
    defaultDimensions: {
      post: { width: 1600, height: 900 },
      banner: { width: 1500, height: 500 },
    },
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

