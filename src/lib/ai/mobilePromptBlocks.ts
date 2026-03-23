import type { ParsedIntent, MobileScreenDescriptor } from "@/types/ai";
import { MOBILE_APP_CATEGORY_STYLES, type MobileAppCategory } from "@/constants/mobileAppCategories";
import {
  DEFAULT_MOBILE_DEVICE_ID,
  MOBILE_DEVICE_PRESETS,
  type MobileDevicePreset,
} from "@/constants/mobileDevices";
import {
  buildAndroidConventionsXml,
  buildCrossPlatformConventionsXml,
  buildIosConventionsXml,
} from "@/lib/ai/mobileConventions";

function pickDeviceForDimensions(dims: { width: number; height: number | "auto" }): MobileDevicePreset {
  if (dims.height === "auto") return MOBILE_DEVICE_PRESETS[DEFAULT_MOBILE_DEVICE_ID];
  const match = Object.values(MOBILE_DEVICE_PRESETS).find(
    (p) => p.width === dims.width && p.height === dims.height
  );
  return match ?? MOBILE_DEVICE_PRESETS[DEFAULT_MOBILE_DEVICE_ID];
}

export function buildMobileContextXml(intent: ParsedIntent, brandPrimaryHex?: string): string {
  const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0]! : intent.dimensions;
  const device = pickDeviceForDimensions(dims as { width: number; height: number | "auto" });
  const appOS = intent.appOS ?? "ios";
  const safe = device.safeArea;

  const osBlock =
    appOS === "android"
      ? buildAndroidConventionsXml(brandPrimaryHex)
      : appOS === "cross_platform"
        ? buildCrossPlatformConventionsXml()
        : buildIosConventionsXml();

  const cat = (intent.appCategory ?? "other") as MobileAppCategory;
  const catNotes = MOBILE_APP_CATEGORY_STYLES[cat] ?? MOBILE_APP_CATEGORY_STYLES.other;

  const categoryXml = `<app_category category="${cat}">
<style_notes>${catNotes.styleNotes}</style_notes>
<color_temperature>${catNotes.colorTemperature}</color_temperature>
<illustration>${catNotes.illustrationStyle}</illustration>
<density>${catNotes.density}</density>
<must_have>${catNotes.mustHaveUi.join("; ")}</must_have>
</app_category>`;

  const planXml =
    intent.screenPlan && intent.screenPlan.length
      ? `<screen_plan>\n${intent.screenPlan
          .map(
            (s) =>
              `<screen index="${s.screenIndex}" type="${escapeXml(
                s.screenType
              )}" title="${escapeXml(s.screenTitle)}" primary_action="${escapeXml(
                s.primaryAction
              )}" nav="${s.navigationPattern}" />`
          )
          .join("\n")}\n</screen_plan>`
      : `<screen_plan><screen index="0" type="single" title="Main" primary_action="" nav="next_button" /></screen_plan>`;

  return `<mobile_context>
<device name="${device.label}" width="${device.width}" height="${device.height}" />
<safe_areas top="${safe.top}" bottom="${safe.bottom}" left="${safe.left}" right="${safe.right}" />
<app_theme>${intent.appTheme ?? "dark"}</app_theme>
<os_conventions>
${osBlock}
</os_conventions>
${categoryXml}
${planXml}
</mobile_context>`;
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function buildMobileScreenFlowXml(opts: {
  screenIndex: number;
  totalScreens: number;
  descriptor?: MobileScreenDescriptor;
  previousScreensXml?: string;
}): string {
  const d = opts.descriptor;
  const cur = d
    ? `<current_screen index="${opts.screenIndex}" total="${opts.totalScreens}">
<type>${escapeXml(d.screenType)}</type>
<title>${escapeXml(d.screenTitle)}</title>
<primary_action>${escapeXml(d.primaryAction)}</primary_action>
<navigation_pattern>${d.navigationPattern}</navigation_pattern>
</current_screen>`
    : `<current_screen index="${opts.screenIndex}" total="${opts.totalScreens}" />`;

  const prev =
    opts.previousScreensXml?.trim() ?
      `<previous_screens>\n${opts.previousScreensXml}\n</previous_screens>`
    : "";

  return `${cur}\n${prev}`;
}
