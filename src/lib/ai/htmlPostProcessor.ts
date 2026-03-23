import { parse } from "node-html-parser";
import type { ParsedIntent } from "@/types/ai";
import type { BrandProfile } from "@prisma/client";

type Args = {
  html: string;
  intent: ParsedIntent;
  brand: Pick<BrandProfile, "colors" | "typography" | "name">;
  repairMalformedHtml?: (html: string) => Promise<string>;
  /** A/B test HTML modifiers (Sprint 16). */
  abModifiers?: { headlineSizeMultiplier?: number; spacingMultiplier?: number };
};

type Result = {
  html: string;
  warnings: string[];
};

const SELF_CLOSING_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function ensureRootDimensions(rootHtml: string, intent: ParsedIntent): string {
  const doc = parse(rootHtml);
  const rootEl: any =
    (doc.querySelector("html") as any) ||
    (doc.querySelector("body > *") as any) ||
    (doc.firstChild as any);
  if (!rootEl || typeof rootEl.setAttribute !== "function") {
    // If parser returns a non-element root (e.g. text/comment), keep output unchanged.
    return doc.toString();
  }

  const dims = Array.isArray(intent.dimensions)
    ? intent.dimensions[0]!
    : (intent.dimensions as any);
  const width = dims?.width ?? 1080;
  const height = dims?.height ?? 1080;

  const existingStyle = (rootEl.getAttribute?.("style") as string | undefined) ?? "";
  const styleParts = existingStyle
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const upsertRule = (key: string, value: string) => {
    const i = styleParts.findIndex((p: string) => p.startsWith(`${key}:`));
    const rule = `${key}: ${value}`;
    if (i >= 0) styleParts[i] = rule;
    else styleParts.push(rule);
  };

  upsertRule("width", `${width}px`);
  // Website/dashboard layouts are content-determined (height: auto).
  if (
    (intent.platform === "website" || intent.platform === "dashboard") &&
    height === "auto"
  ) {
    // Intentionally omit height to allow full-page layouts.
  } else if (height !== "auto") {
    upsertRule("height", `${height}px`);
  }

  if (intent.platform === "instagram" || intent.platform === "facebook") upsertRule("overflow", "hidden");

  rootEl.setAttribute("style", styleParts.join("; "));
  return doc.toString();
}

function stripScriptsAndHandlers(html: string): string {
  // Remove script tags
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove inline JS event handlers in quoted and unquoted forms.
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return cleaned;
}

function normalisePlaceholderImages(html: string): string {
  const doc = parse(html);
  const imgs = doc.querySelectorAll("img[data-placeholder=\"true\"]");
  for (const img of imgs) {
    const alt = img.getAttribute("alt") ?? "image";
    const width = Number(img.getAttribute("width") ?? "1080") || 1080;
    const height = Number(img.getAttribute("height") ?? "1080") || 1080;
    const desc = encodeURIComponent(alt.toLowerCase().replace(/\s+/g, "-"));
    const url = `https://placeholder.designforge.ai/${width}/${height}/${desc}`;
    const src = (img.getAttribute("src") ?? "").trim();
    img.setAttribute("src", src || url);
  }
  return doc.toString();
}

function extractFontFamilies(typography: unknown): string[] {
  if (!typography || typeof typography !== "object") return [];
  const values = Object.values(typography as Record<string, unknown>);
  const fonts = values
    .map((v) => (typeof v === "string" ? v : ""))
    .filter(Boolean)
    .map((f) => f.replace(/["']/g, ""))
    .map((f) => f.split(",")[0]!.trim())
    .filter((f) => f && !/^(sans-serif|serif|monospace|system-ui)$/i.test(f));
  return Array.from(new Set(fonts));
}

function ensureTailwindAndFonts(
  html: string,
  brand: Pick<BrandProfile, "typography">
): string {
  let out = html;
  const injections: string[] = [];

  if (!out.includes("https://cdn.tailwindcss.com")) {
    injections.push('<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>');
  }

  const fonts = extractFontFamilies(brand.typography);
  for (const font of fonts) {
    const family = encodeURIComponent(font).replace(/%20/g, "+");
    const href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
    if (!out.includes(href)) {
      injections.push(`<link rel="stylesheet" href="${href}">`);
    }
  }

  if (!injections.length) return out;

  const headOpen = /<head[^>]*>/i;
  if (headOpen.test(out)) {
    return out.replace(headOpen, (m) => `${m}\n${injections.join("\n")}\n`);
  }
  if (out.includes("</head>")) {
    return out.replace("</head>", `${injections.join("\n")}\n</head>`);
  }
  return `<head>\n${injections.join("\n")}\n</head>\n${out}`;
}

function validateHtmlStructure(html: string): { valid: boolean; reason?: string } {
  if (!html.trim()) return { valid: false, reason: "Empty HTML output" };

  // Quick parser pass
  try {
    parse(html);
  } catch {
    return { valid: false, reason: "Parser failed to read HTML" };
  }

  // Lightweight tag balancing check.
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*?>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html))) {
    const fullTag = match[0];
    const name = match[1]!.toLowerCase();
    if (fullTag.startsWith("</")) {
      const expected = stack.pop();
      if (expected !== name) {
        return { valid: false, reason: `Mismatched closing tag: ${name}` };
      }
      continue;
    }
    const isSelfClosing = fullTag.endsWith("/>") || SELF_CLOSING_TAGS.has(name);
    if (!isSelfClosing) stack.push(name);
  }
  if (stack.length > 0) {
    return { valid: false, reason: `Unclosed tag(s): ${stack.slice(-3).join(", ")}` };
  }

  return { valid: true };
}

/**
 * Guards against "blank but valid" outputs like a lone empty container.
 * These currently render as a white canvas and look like a broken preview.
 */
function hasMeaningfulDesignContent(html: string): boolean {
  const doc = parse(html);
  const root: any = doc.querySelector("body") || doc.querySelector("html") || doc;
  const elements = root.querySelectorAll?.("*") ?? [];
  const text = String(root.text ?? "").replace(/\s+/g, " ").trim();

  const richNodes = root.querySelectorAll?.(
    "img,svg,canvas,video,section,article,main,header,footer,nav,button,input,a"
  ) ?? [];

  // Accept if there is enough structure, text, or rich visual/interactive nodes.
  if (elements.length >= 6) return true;
  if (text.length >= 24) return true;
  if (richNodes.length >= 2) return true;

  return false;
}

/** Ensures mobile previews respect notch / home-indicator safe areas when rendered in device frames. */
function injectMobileSafeAreaInsets(html: string, intent: ParsedIntent): string {
  if (intent.platform !== "mobile") return html;
  if (html.includes('data-designforge-mobile-safe-area="1"')) return html;

  const css = `<style data-designforge-mobile-safe-area="1">
  html, body { box-sizing: border-box; }
  body {
    padding-top: max(10px, env(safe-area-inset-top, 0px));
    padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
</style>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${css}\n`);
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${css}\n</head>`);
  }
  return `${css}\n${html}`;
}

/** Apply A/B headline/spacing multipliers to inline styles (best-effort). */
function applyAbModifiers(
  html: string,
  modifiers: { headlineSizeMultiplier?: number; spacingMultiplier?: number }
): string {
  const hm = modifiers.headlineSizeMultiplier;
  const sm = modifiers.spacingMultiplier;
  if ((!hm || hm === 1) && (!sm || sm === 1)) return html;

  const doc = parse(html);
  const scaleFont = (style: string, mult: number) => {
    return style.replace(/font-size\s*:\s*([\d.]+)(px|rem)/gi, (_, n, u) => {
      const v = parseFloat(n) * mult;
      return `font-size: ${v.toFixed(u === "rem" ? 3 : 0)}${u}`;
    });
  };
  const scaleSpacing = (style: string, mult: number) => {
    return style.replace(
      /(padding|margin|gap)\s*:\s*([^;]+)/gi,
      (_m, prop, val) => {
        const next = String(val).replace(/([\d.]+)px/gi, (_, n) => `${Math.round(parseFloat(n) * mult)}px`);
        return `${prop}: ${next}`;
      }
    );
  };

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    const tag = String(node.rawTagName || "").toLowerCase();
    const st = node.getAttribute?.("style");
    if (st && typeof st === "string") {
      let next = st;
      if (hm && hm !== 1 && /^h[1-6]$/i.test(tag)) {
        next = scaleFont(next, hm);
      }
      if (sm && sm !== 1) {
        next = scaleSpacing(next, sm);
      }
      node.setAttribute("style", next);
    }
    const ch = node.childNodes;
    if (ch && ch.length) {
      for (const c of ch) walk(c);
    }
  };
  walk(doc as any);
  return doc.toString();
}

function injectAutoHeightPostMessage(html: string, intent: ParsedIntent) {
  const shouldInject = intent.platform === "website" || intent.platform === "dashboard";
  if (!shouldInject) return html;

  // Parent listens for this message and sets iframe height to content scrollHeight.
  const script = `
<script>
  (function(){
    function clearHighlight(){
      try{
        var prev = document.querySelectorAll('[data-designforge-highlight="1"]');
        prev.forEach(function(n){ n.removeAttribute('data-designforge-highlight'); });
      }catch(e){}
    }
    function setHighlight(target){
      try{
        clearHighlight();
        if(!target) return;
        var el = document.querySelector('[data-section-type="'+target+'"]');
        if(el){
          el.setAttribute('data-designforge-highlight','1');
          // Outline via inline style to avoid CSS injection issues.
          el.style.outline = '3px solid var(--accent-primary, #6366f1)';
          el.style.outlineOffset = '2px';
        }
      }catch(e){}
    }

    window.addEventListener('message', function(e){
      var data = e && e.data;
      if(!data) return;
      if(data.__designforge_highlight){
        setHighlight(String(data.__designforge_highlight));
      } else if(data.__designforge_highlight === null) {
        clearHighlight();
      }
    });

    function compute(){
      try {
        var h = Math.max(
          document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0
        );
        window.parent && window.parent.postMessage({ __designforge: "auto_height", height: h }, "*");
      } catch (e) {}
    }
    window.addEventListener("load", function(){ setTimeout(compute, 50); });
    window.addEventListener("resize", function(){ compute(); });
    setTimeout(compute, 250);
  })();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}\n</body>`);
  }
  return `${html}${script}`;
}

export async function postProcessHtml({
  html,
  intent,
  brand,
  repairMalformedHtml,
  abModifiers,
}: Args): Promise<Result> {
  const warnings: string[] = [];
  let currentHtml = html;

  let validation = validateHtmlStructure(currentHtml);
  if (!validation.valid) {
    try {
      // Retry once by asking the model to fix malformed structure.
      if (typeof repairMalformedHtml === "function") {
        currentHtml = await repairMalformedHtml(currentHtml);
        validation = validateHtmlStructure(currentHtml);
      }
    } catch {
      // handled below
    }
  }
  if (!validation.valid) {
    const err = new Error(validation.reason ?? "Malformed HTML");
    (err as Error & { code?: string }).code = "GENERATION_INVALID_HTML";
    throw err;
  }

  let processed = stripScriptsAndHandlers(currentHtml);
  processed = normalisePlaceholderImages(processed);
  if (abModifiers) {
    processed = applyAbModifiers(processed, {
      headlineSizeMultiplier: abModifiers.headlineSizeMultiplier,
      spacingMultiplier: abModifiers.spacingMultiplier,
    });
  }
  processed = ensureRootDimensions(processed, intent);
  processed = ensureTailwindAndFonts(processed, brand);
  processed = injectMobileSafeAreaInsets(processed, intent);
  processed = injectAutoHeightPostMessage(processed, intent);

  if (!hasMeaningfulDesignContent(processed)) {
    const err = new Error("Generated output was empty. Please try again.");
    (err as Error & { code?: string }).code = "GENERATION_EMPTY_HTML";
    throw err;
  }

  // Very light brand color check
  const colors = (brand.colors ?? {}) as any;
  const primary = colors.primary as string | undefined;
  if (primary && !processed.toLowerCase().includes(primary.toLowerCase())) {
    warnings.push("Primary brand color not detected in HTML.");
    console.warn(`[HTML Post Processor] Brand color missing for "${brand.name}"`, {
      primary,
      platform: intent.platform,
      format: intent.format,
    });
  }

  return { html: processed, warnings };
}

