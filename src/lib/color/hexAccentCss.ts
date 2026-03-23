/**
 * Design tokens use space-separated HSL components: `hsl(var(--accent))`.
 * Hex colors must be converted; raw `--accent: #rrggbb` breaks `hsl(var(--accent))`.
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const n = parseInt(raw, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** sRGB relative luminance (WCAG), 0–1 */
function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function adjustLightness(triplet: string, delta: number): string {
  const parts = triplet.trim().split(/\s+/);
  if (parts.length !== 3) return triplet;
  const lStr = parts[2] ?? "50%";
  const l = parseFloat(lStr.replace("%", ""));
  if (Number.isNaN(l)) return triplet;
  const nl = Math.max(0, Math.min(100, l + delta));
  return `${parts[0]} ${parts[1]} ${Math.round(nl)}%`;
}

export function hexToHslSpaceSeparated(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/**
 * Returns inline CSS for :root when primary is a hex brand color.
 * Sets --accent / --accent-hover as HSL triples and --accent-foreground for contrast.
 */
export function whiteLabelAccentCss(primaryHex: string): string | null {
  const triplet = hexToHslSpaceSeparated(primaryHex);
  if (!triplet) return null;
  const lum = relativeLuminance(primaryHex);
  // Dark text on light accents, light text on dark/medium accents
  const foreground =
    lum != null && lum > 0.55 ? "220 27% 8%" : "210 40% 98%";
  const hover = adjustLightness(triplet, 7);
  return `:root {
  --accent: ${triplet};
  --accent-hover: ${hover};
  --ring: ${triplet};
  --accent-foreground: ${foreground};
}`;
}
