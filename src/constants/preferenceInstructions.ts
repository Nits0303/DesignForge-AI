type AnyJson = Record<string, unknown> | unknown;

function asScale(v: any): number {
  if (v == null) return 1;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.scale === "number") return v.scale;
  return 1;
}

export function getPreferenceInstruction(preferenceKey: string, preferenceValue: AnyJson): string {
  switch (preferenceKey) {
    case "default_background": {
      const mode = String(preferenceValue ?? "");
      return `Default to ${mode} backgrounds unless the user's prompt explicitly requests a light design.`;
    }
    case "headline_size_modifier": {
      const scale = asScale(preferenceValue);
      const pct = Math.round((scale - 1) * 100);
      const direction = pct >= 0 ? `up by ~${pct}%` : `down by ~${Math.abs(pct)}%`;
      return `Scale headline font sizes ${direction} from the template defaults.`;
    }
    case "layout_density": {
      const density = String(preferenceValue ?? "");
      return density === "spacious"
        ? "Use generous padding and whitespace between sections and components."
        : "Use tighter spacing and a more compact layout between sections and components.";
    }
    case "always_include_cta": {
      return `Always include at least one clear call-to-action button or link in the design.`;
    }
    case "color_temperature": {
      const temp = String(preferenceValue ?? "");
      return temp === "warm"
        ? "Bias the overall design color temperature toward warm tones while keeping brand hex codes consistent."
        : "Bias the overall design color temperature toward cool tones while keeping brand hex codes consistent.";
    }
    case "preferred_heading_font": {
      const fontName =
        typeof preferenceValue === "object" && preferenceValue != null
          ? (preferenceValue as any).fontName ?? String(preferenceValue)
          : String(preferenceValue ?? "");
      return `Use the preferred heading font (${fontName}) for all headline/title text when it is compatible with the template.`;
    }
    default:
      return `Apply the user's design preference (${preferenceKey}) where it does not conflict with explicit instructions.`;
  }
}

