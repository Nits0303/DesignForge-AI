import type { ParsedIntent, ReferenceAnalysis } from "@/types/ai";

function normalizeHex(v: string | undefined | null) {
  if (!v) return null;
  const s = v.trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : null;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorTemperatureFromHex(hex: string) {
  const { r, b } = hexToRgb(hex);
  if (Math.abs(r - b) < 16) return "neutral" as const;
  return r > b ? ("warm" as const) : ("cool" as const);
}

export function referenceRevisionSuggestions(
  analysis: ReferenceAnalysis,
  intent: ParsedIntent | null | undefined,
  opts?: {
    brandPrimaryColor?: string | null;
    generatedDensity?: "sparse" | "moderate" | "dense";
    hasGradientInCurrent?: boolean;
    currentHtml?: string | null;
  }
): string[] {
  const out: string[] = [];
  const colorTemperature = analysis?.colorPalette?.colorTemperature ?? null;
  const spacingDensity = analysis?.spacing?.density ?? null;
  const hasGradients = Boolean(analysis?.visualStyle?.hasGradients);
  const borderRadius = analysis?.visualStyle?.borderRadius ?? null;
  const sizeScale = analysis?.typography?.sizeScale ?? null;
  const mood = analysis?.visualStyle?.mood ?? null;

  const brandHex = normalizeHex(opts?.brandPrimaryColor ?? null);
  const brandTemp = brandHex ? colorTemperatureFromHex(brandHex) : null;

  if (colorTemperature === "warm" && brandTemp === "cool") {
    out.push("Warm up the color palette with amber and orange tones");
  }
  if (spacingDensity === "spacious" && (opts?.generatedDensity ?? "dense") === "dense") {
    out.push("Add more whitespace between sections");
  }
  const html = opts?.currentHtml ?? "";
  const hasGradientInCurrent =
    opts?.hasGradientInCurrent ??
    /(bg-gradient|linear-gradient|radial-gradient)/i.test(html);
  const hasPillRadiusInCurrent = /(rounded-full|rounded-\[9999px\]|border-radius:\s*9999px)/i.test(html);
  const hasLargeHeadingCurrent = /(text-5xl|text-6xl|text-7xl|font-size:\s*(4[2-9]|[5-9]\d)px)/i.test(
    html
  );
  const denseCurrentByHtml = /grid-cols-(4|5|6)|<table|data-table|kpi/i.test(html);
  const inferredDensity = denseCurrentByHtml ? "dense" : opts?.generatedDensity ?? "moderate";

  if (hasGradients && !hasGradientInCurrent) {
    out.push("Add a subtle gradient to the hero background");
  }
  if (borderRadius === "pill" && !hasPillRadiusInCurrent) {
    out.push("Round the button and card corners to pill style");
  }
  if (sizeScale === "large" && !hasLargeHeadingCurrent) {
    out.push("Scale up the headline text for more impact");
  }
  if (spacingDensity === "spacious" && inferredDensity === "dense") {
    out.push("Add more whitespace between sections");
  }

  if (intent?.platform === "dashboard" && mood === "technical") {
    out.push("Increase data hierarchy contrast for a more technical dashboard feel");
  }

  if (out.length === 0) {
    out.push("Adjust spacing and typography to better match the reference mood");
    out.push("Refine layout density to align with the reference structure");
    out.push("Tune visual style keywords (shadows, gradients, corners) to match reference");
  }

  return out.slice(0, 5);
}

