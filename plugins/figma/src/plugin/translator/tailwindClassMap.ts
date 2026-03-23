import type { ResolvedStyles } from "../../shared/types";
import { BLACK, PALETTES, WHITE } from "./tailwindColors";

const spacing: Record<string, number> = {};
for (let i = 0; i <= 96; i++) {
  spacing[String(i)] = i * 4;
}

export function applySpacingToken(key: string, n: string): Partial<ResolvedStyles> | null {
  const px = spacing[n];
  if (px === undefined) return null;
  return { [key]: px };
}

function normalizeHex(h: string): string {
  return h.startsWith("#") ? h : `#${h}`;
}

function resolveArbitrary(cls: string): Partial<ResolvedStyles> | null {
  const bgHex = /^bg-\[(#[0-9a-fA-F]{3,8})\]$/.exec(cls);
  if (bgHex) return { fillHex: normalizeHex(bgHex[1]!) };

  const textHex = /^text-\[(#[0-9a-fA-F]{3,8})\]$/.exec(cls);
  if (textHex) return { textHex: normalizeHex(textHex[1]!) };

  const wPx = /^w-\[(\d+)px\]$/.exec(cls);
  if (wPx) return { widthPx: Number(wPx[1]) };
  const hPx = /^h-\[(\d+)px\]$/.exec(cls);
  if (hPx) return { heightPx: Number(hPx[1]) };

  const pAll = /^p-\[(\d+)px\]$/.exec(cls);
  if (pAll) {
    const v = Number(pAll[1]);
    return { paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v };
  }
  const pxPx = /^px-\[(\d+)px\]$/.exec(cls);
  if (pxPx) return { paddingLeft: Number(pxPx[1]), paddingRight: Number(pxPx[1]) };
  const pyPx = /^py-\[(\d+)px\]$/.exec(cls);
  if (pyPx) return { paddingTop: Number(pyPx[1]), paddingBottom: Number(pyPx[1]) };

  const roundedPx = /^rounded-\[(\d+)px\]$/.exec(cls);
  if (roundedPx) return { borderRadiusPx: Number(roundedPx[1]) };

  const gapPx = /^gap-\[(\d+)px\]$/.exec(cls);
  if (gapPx) return { gapPx: Number(gapPx[1]) };

  const textPx = /^text-\[(\d+)px\]$/.exec(cls);
  if (textPx) return { fontSizePx: Number(textPx[1]) };

  return null;
}

const ROUNDED: Record<string, number> = {
  none: 0,
  sm: 2,
  DEFAULT: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  "3xl": 24,
  full: 9999,
};

const SHADOW: Record<string, "sm" | "md" | "lg" | "xl" | "2xl"> = {
  "shadow-sm": "sm",
  shadow: "md",
  "shadow-md": "md",
  "shadow-lg": "lg",
  "shadow-xl": "xl",
  "shadow-2xl": "2xl",
};

const FONT_SIZE: Record<string, number> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
};

export function resolveStaticClass(cls: string): Partial<ResolvedStyles> | null {
  const arb = resolveArbitrary(cls);
  if (arb) return arb;

  if (cls === "w-full") return { width: "100%" };
  if (cls === "h-full") return { height: "100%" };
  if (cls === "min-h-screen") return { heightPx: 800 };
  if (cls === "flex") return { display: "flex" };
  if (cls === "flex-col") return { flexDirection: "column" };
  if (cls === "flex-row") return { flexDirection: "row" };
  if (cls === "flex-wrap") return { flexWrap: "wrap" };
  if (cls === "items-center") return { alignItems: "center" };
  if (cls === "items-start") return { alignItems: "start" };
  if (cls === "items-end") return { alignItems: "end" };
  if (cls === "items-stretch") return { alignItems: "stretch" };
  if (cls === "justify-center") return { justifyContent: "center" };
  if (cls === "justify-between") return { justifyContent: "space-between" };
  if (cls === "justify-start") return { justifyContent: "start" };
  if (cls === "justify-end") return { justifyContent: "end" };
  if (cls === "justify-around") return { justifyContent: "space-around" };

  if (cls === "rounded-full") return { borderRadiusPx: 9999 };

  const rounded = /^rounded(?:-(\w+))?$/.exec(cls);
  if (rounded) {
    const key = rounded[1] ?? "DEFAULT";
    const v = ROUNDED[key];
    if (v !== undefined) return { borderRadiusPx: v };
  }

  if (cls === "bg-white") return { fillHex: WHITE };
  if (cls === "bg-black") return { fillHex: BLACK };
  if (cls === "text-white") return { textHex: WHITE };
  if (cls === "text-black") return { textHex: BLACK };

  for (const [name, scale] of Object.entries(PALETTES)) {
    const bg = new RegExp(`^bg-${name}-(\\d+)$`).exec(cls);
    if (bg) {
      const shade = Number(bg[1]);
      const hex = scale[shade];
      if (hex) return { fillHex: hex };
    }
    const tx = new RegExp(`^text-${name}-(\\d+)$`).exec(cls);
    if (tx) {
      const shade = Number(tx[1]);
      const hex = scale[shade];
      if (hex) return { textHex: hex };
    }
    const border = new RegExp(`^border-${name}-(\\d+)$`).exec(cls);
    if (border) {
      const shade = Number(border[1]);
      const hex = scale[shade];
      if (hex) return { borderHex: hex };
    }
  }

  const wm = /^w-(\d+)$/.exec(cls);
  if (wm) return applySpacingToken("widthPx", wm[1]!);
  const hm = /^h-(\d+)$/.exec(cls);
  if (hm) return applySpacingToken("heightPx", hm[1]!);
  const p = /^p-(\d+)$/.exec(cls);
  if (p) {
    const px = spacing[p[1]!];
    if (px === undefined) return null;
    return { paddingTop: px, paddingRight: px, paddingBottom: px, paddingLeft: px };
  }
  const px = /^px-(\d+)$/.exec(cls);
  if (px) return { paddingLeft: spacing[px[1]!], paddingRight: spacing[px[1]!] };
  const py = /^py-(\d+)$/.exec(cls);
  if (py) return { paddingTop: spacing[py[1]!], paddingBottom: spacing[py[1]!] };
  const pt = /^pt-(\d+)$/.exec(cls);
  if (pt) return { paddingTop: spacing[pt[1]!] };
  const pr = /^pr-(\d+)$/.exec(cls);
  if (pr) return { paddingRight: spacing[pr[1]!] };
  const pb = /^pb-(\d+)$/.exec(cls);
  if (pb) return { paddingBottom: spacing[pb[1]!] };
  const pl = /^pl-(\d+)$/.exec(cls);
  if (pl) return { paddingLeft: spacing[pl[1]!] };
  const m = /^m-(\d+)$/.exec(cls);
  if (m) return { marginTop: spacing[m[1]!], marginRight: spacing[m[1]!], marginBottom: spacing[m[1]!], marginLeft: spacing[m[1]!] };
  const mx = /^mx-(\d+)$/.exec(cls);
  if (mx) return { marginLeft: spacing[mx[1]!], marginRight: spacing[mx[1]!] };
  const my = /^my-(\d+)$/.exec(cls);
  if (my) return { marginTop: spacing[my[1]!], marginBottom: spacing[my[1]!] };
  const mt = /^mt-(\d+)$/.exec(cls);
  if (mt) return { marginTop: spacing[mt[1]!] };
  const mb = /^mb-(\d+)$/.exec(cls);
  if (mb) return { marginBottom: spacing[mb[1]!] };

  const gap = /^gap-(\d+)$/.exec(cls);
  if (gap) {
    const px = spacing[gap[1]!];
    if (px !== undefined) return { gapPx: px };
  }
  const gapX = /^gap-x-(\d+)$/.exec(cls);
  if (gapX) {
    const px = spacing[gapX[1]!];
    if (px !== undefined) return { gapPx: px };
  }
  const gapY = /^gap-y-(\d+)$/.exec(cls);
  if (gapY) {
    const px = spacing[gapY[1]!];
    if (px !== undefined) return { gapPx: px };
  }

  const borderW = /^border(?:-(\d+))?$/.exec(cls);
  if (borderW) {
    const w = borderW[1] ? Number(borderW[1]) : 1;
    if (!Number.isNaN(w)) return { borderWidthPx: w };
  }
  if (cls === "border-0") return { borderWidthPx: 0 };

  if (cls in FONT_SIZE) return { fontSizePx: FONT_SIZE[cls]! };
  if (cls in SHADOW) return { shadow: SHADOW[cls as keyof typeof SHADOW] };

  const opacity = /^opacity-(\d+)$/.exec(cls);
  if (opacity) {
    const o = Number(opacity[1]);
    if (o >= 0 && o <= 100) return { opacity: o / 100 };
  }

  const font = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.exec(cls);
  if (font) {
    const map: Record<string, number> = {
      thin: 100,
      extralight: 200,
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    };
    const w = map[font[1]!];
    if (w) return { fontWeight: w };
  }

  return null;
}
