import { getPreferenceInstruction } from "@/constants/preferenceInstructions";

type UserPreferenceLike = {
  preferenceKey: string;
  preferenceValue: any;
  confidence: number;
  manualOverride?: boolean;
};

const LEARNED_PREFERENCE_KEYS = new Set([
  "default_background",
  "headline_size_modifier",
  "layout_density",
  "always_include_cta",
  "color_temperature",
  "preferred_heading_font",
]);

function escapeXmlAttr(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializePreferenceValue(preferenceKey: string, preferenceValue: any): string {
  switch (preferenceKey) {
    case "headline_size_modifier":
      if (preferenceValue && typeof preferenceValue === "object") {
        const scale = typeof preferenceValue.scale === "number" ? preferenceValue.scale : 1;
        return String(scale);
      }
      return String(preferenceValue ?? 1);
    case "always_include_cta":
      return preferenceValue ? "true" : "false";
    case "default_background":
    case "layout_density":
    case "color_temperature":
      return String(preferenceValue ?? "");
    case "preferred_heading_font":
      if (preferenceValue && typeof preferenceValue === "object") {
        return String(preferenceValue.fontName ?? "");
      }
      return String(preferenceValue ?? "");
    default:
      return typeof preferenceValue === "string" ? preferenceValue : JSON.stringify(preferenceValue ?? null);
  }
}

export function preferenceSerializer(preferences: UserPreferenceLike[]): string {
  const eligible = preferences.filter((p) => (p.confidence ?? 0) > 0.6 && LEARNED_PREFERENCE_KEYS.has(p.preferenceKey));
  if (!eligible.length) return "";

  const lines = eligible.map((p) => {
    const valueStr = serializePreferenceValue(p.preferenceKey, p.preferenceValue);
    const instruction = getPreferenceInstruction(p.preferenceKey, p.preferenceValue);
    const valueAttr = escapeXmlAttr(valueStr);
    const instructionAttr = escapeXmlAttr(instruction);
    return `  <preference key="${escapeXmlAttr(p.preferenceKey)}" value="${valueAttr}" confidence="${Number(
      p.confidence ?? 0
    ).toFixed(2)}" instruction="${instructionAttr}" />`;
  });

  return `<user_preferences>\n${lines.join("\n")}\n</user_preferences>`;
}

