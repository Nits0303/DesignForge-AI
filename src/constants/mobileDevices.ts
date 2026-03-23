/**
 * Mobile preview / generation device presets (Sprint 14).
 * Default: iOS Standard — 390×844 (iPhone 14/15 Pro class).
 */

export type MobileDeviceId =
  | "ios_standard"
  | "ios_small"
  | "android_standard"
  | "android_large"
  | "tablet";

export type SafeAreaInsets = { top: number; bottom: number; left: number; right: number };

export type MobileDevicePreset = {
  id: MobileDeviceId;
  label: string;
  os: "ios" | "android" | "tablet";
  width: number;
  height: number;
  safeArea: SafeAreaInsets;
};

export const MOBILE_DEVICE_PRESETS: Record<MobileDeviceId, MobileDevicePreset> = {
  ios_standard: {
    id: "ios_standard",
    label: "iPhone 15 Pro",
    os: "ios",
    width: 390,
    height: 844,
    safeArea: { top: 59, bottom: 34, left: 0, right: 0 },
  },
  ios_small: {
    id: "ios_small",
    label: "iPhone SE",
    os: "ios",
    width: 375,
    height: 667,
    safeArea: { top: 20, bottom: 0, left: 0, right: 0 },
  },
  android_standard: {
    id: "android_standard",
    label: "Android (360×800)",
    os: "android",
    width: 360,
    height: 800,
    safeArea: { top: 24, bottom: 24, left: 0, right: 0 },
  },
  android_large: {
    id: "android_large",
    label: "Pixel 7 class",
    os: "android",
    width: 412,
    height: 915,
    safeArea: { top: 24, bottom: 24, left: 0, right: 0 },
  },
  tablet: {
    id: "tablet",
    label: "Tablet",
    os: "tablet",
    width: 768,
    height: 1024,
    safeArea: { top: 24, bottom: 20, left: 0, right: 0 },
  },
};

export const DEFAULT_MOBILE_DEVICE_ID: MobileDeviceId = "ios_standard";

export function getMobileDevicePreset(id: MobileDeviceId): MobileDevicePreset {
  return MOBILE_DEVICE_PRESETS[id] ?? MOBILE_DEVICE_PRESETS[DEFAULT_MOBILE_DEVICE_ID];
}

/** Swap width/height for landscape preview. */
export function applyOrientation(
  preset: MobileDevicePreset,
  orientation: "portrait" | "landscape"
): { width: number; height: number; safeArea: SafeAreaInsets } {
  if (orientation === "portrait") {
    return { width: preset.width, height: preset.height, safeArea: { ...preset.safeArea } };
  }
  return {
    width: preset.height,
    height: preset.width,
    safeArea: {
      top: preset.safeArea.left,
      bottom: preset.safeArea.right,
      left: preset.safeArea.bottom,
      right: preset.safeArea.top,
    },
  };
}
