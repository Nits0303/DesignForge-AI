/**
 * Brand color swatches for UI lists.
 * Always key React children by `role`, never by hex — the same color can appear twice.
 */

export type BrandSwatch = { role: string; value: string };

/** Default order for semantic brand tokens (matches BrandColors). */
export const SEMANTIC_BRAND_COLOR_ORDER = [
  "primary",
  "secondary",
  "accent",
  "background",
  "text",
] as const;

const FALLBACK_ROLES = ["swatch-1", "swatch-2", "swatch-3", "swatch-4", "swatch-5"] as const;

/** Shown when no brand or no colors — each role is unique for stable keys. */
export const FALLBACK_BRAND_SWATCHES: BrandSwatch[] = [
  { role: FALLBACK_ROLES[0], value: "#6366f1" },
  { role: FALLBACK_ROLES[1], value: "#8b5cf6" },
  { role: FALLBACK_ROLES[2], value: "#a78bfa" },
  { role: FALLBACK_ROLES[3], value: "#0f172a" },
  { role: FALLBACK_ROLES[4], value: "#f8fafc" },
];

function isNonEmptyColor(v: unknown): v is string {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0;
}

/**
 * Map known semantic keys in order (primary, secondary, …). Keys are always unique.
 */
export function brandSwatchesInSemanticOrder(
  colors: Record<string, unknown> | null | undefined,
  order: readonly string[] = SEMANTIC_BRAND_COLOR_ORDER
): BrandSwatch[] {
  if (!colors || typeof colors !== "object") return [];
  return order
    .map((role) => {
      const v = colors[role];
      if (!isNonEmptyColor(v)) return null;
      return { role, value: String(v).trim() };
    })
    .filter((x): x is BrandSwatch => x !== null);
}

/**
 * Arbitrary color maps (extra keys from API). Sorted role names for stable order; keys unique.
 */
export function brandSwatchesFromMap(
  colors: Record<string, unknown> | null | undefined,
  max: number
): BrandSwatch[] {
  if (!colors || typeof colors !== "object") return [];
  const entries = Object.entries(colors)
    .filter(([, v]) => isNonEmptyColor(v))
    .map(([role, v]) => ({ role, value: String(v).trim() }));
  entries.sort((a, b) => a.role.localeCompare(b.role));
  return entries.slice(0, Math.max(0, max));
}
