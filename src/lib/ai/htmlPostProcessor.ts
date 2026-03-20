import { parse } from "node-html-parser";
import type { ParsedIntent } from "@/types/ai";
import type { BrandProfile } from "@prisma/client";

type Args = {
  html: string;
  intent: ParsedIntent;
  brand: Pick<BrandProfile, "colors" | "typography" | "name">;
  repairMalformedHtml?: (html: string) => Promise<string>;
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
  const rootEl: any = (doc.firstChild as any) || doc;

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
  processed = ensureRootDimensions(processed, intent);
  processed = ensureTailwindAndFonts(processed, brand);
  processed = injectAutoHeightPostMessage(processed, intent);

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

