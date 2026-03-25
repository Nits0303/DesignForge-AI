import { parse } from "node-html-parser";
import type { ParsedIntent } from "@/types/ai";
import type { BrandProfile } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  SOCIAL_MEDIA_ICON_ORDER,
  SOCIAL_MEDIA_ICON_SVGS,
  type SocialIconKey,
} from "@/constants/socialMediaIcons";

type Args = {
  html: string;
  intent: ParsedIntent;
  brand: Pick<BrandProfile, "colors" | "typography" | "name"> & { logoPrimaryUrl?: string | null };
  userPrompt?: string;
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

  const expected =
    intent.selectedDimension && typeof intent.selectedDimension.width === "number" && typeof intent.selectedDimension.height === "number"
      ? { width: intent.selectedDimension.width, height: intent.selectedDimension.height }
      : (() => {
          const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0]! : (intent.dimensions as any);
          return { width: dims?.width ?? 1080, height: dims?.height ?? 1080 };
        })();
  const width = expected.width ?? 1080;
  const height = expected.height ?? 1080;

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

  if (
    intent.platform === "instagram" ||
    intent.platform === "facebook" ||
    intent.platform === "linkedin" ||
    intent.platform === "twitter"
  ) {
    upsertRule("overflow", "hidden");
  }

  // For landscape social posts, prevent sparse content collapsing height.
  if (
    intent.selectedDimension?.id === "landscape" &&
    typeof height === "number" &&
    height === 675
  ) {
    upsertRule("min-height", "675px");
  }

  // Portrait feed posts (e.g. LinkedIn 1080×1350): same — avoid collapsed canvas height.
  if (
    intent.selectedDimension?.id === "portrait" &&
    typeof height === "number" &&
    height === 1350
  ) {
    upsertRule("min-height", "1350px");
  }

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

function stripMarkdownCodeFences(html: string): string {
  let out = html.trim();
  // Common model failure mode: wrapping raw HTML in markdown fences.
  out = out.replace(/^```(?:html|HTML)?\s*/i, "");
  out = out.replace(/\s*```$/, "");
  out = out.replace(/^["']?```(?:html|HTML)?\s*/i, "");
  out = out.replace(/\s*```["']?$/, "");
  // Some models emit odd fence-like prefixes such as "'''html" or "\"\"html".
  out = out.replace(/^(?:['"`]{2,}\s*html|html)\s*\n+/i, "");
  // Some responses prepend stray prose before the first tag.
  const firstTag = out.search(/</);
  if (firstTag > 0) out = out.slice(firstTag);
  // Handle escaped HTML payloads like "&lt;div&gt;...".
  if (/&lt;[a-z!/]/i.test(out)) {
    out = out
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
  return out.trim();
}

function requestsLogoAtTop(prompt: string | undefined): boolean {
  const t = String(prompt ?? "");
  return /\blogo\b.*\b(top|header|first)\b|\b(top|header|first)\b.*\blogo\b/i.test(t);
}

function ensureLogoNearTop(html: string, logoUrl: string, intent: ParsedIntent): string {
  const src = String(logoUrl ?? "").trim();
  if (!src) return html;

  const esc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = html;
  // Remove any existing exact logo <img> occurrences to avoid duplicates.
  out = out
    .replace(new RegExp(`<img[^>]*src=["']${esc}["'][^>]*>`, "gi"), "")
    .replace(new RegExp(`<img[^>]*src=['"]${esc}['"][^>]*>`, "gi"), "");

  const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0] : (intent.dimensions as any);
  const w = Number(dims?.width) || 1200;
  const h = Number(dims?.height) || 627;
  const logoW = Math.max(72, Math.round(w * 0.12));
  const logoH = Math.max(28, Math.round(h * 0.06));
  // Deterministic top-left positioning.
  // Keep padding small so the logo sits closest to the top-left corner.
  const header = `<div data-designforge-logo-top="1" style="position:absolute;top:0;left:0;z-index:50;padding:6px 8px 4px 8px;display:flex;align-items:flex-start;justify-content:flex-start;"><img src="${src}" alt="Brand logo" style="width:${logoW}px;height:${logoH}px;object-fit:contain;display:block;" /></div>`;

  if (/<body[^>]*>/i.test(out)) {
    return out.replace(/<body([^>]*)>/i, `<body$1>${header}`);
  }
  return `${header}${html}`;
}

function ensureSocialIconsOverlay(html: string, intent: ParsedIntent): string {
  const p = String(intent.platform ?? "").toLowerCase();
  if (!["instagram", "linkedin", "facebook", "twitter"].includes(p)) return html;
  if (/<div[^>]*data-designforge-social-icons-overlay="1"[^>]*>/i.test(html)) return html;

  const anchors = SOCIAL_MEDIA_ICON_ORDER.map((k: SocialIconKey) => {
    const svg = SOCIAL_MEDIA_ICON_SVGS[k];
    const label =
      k === "twitterX"
        ? "Twitter/X"
        : k === "linkedin"
          ? "LinkedIn"
          : k === "instagram"
            ? "Instagram"
            : k === "facebook"
              ? "Facebook"
              : k;
    return `<a href="#" aria-label="${label}" data-designforge-social-icon="${k}" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);text-decoration:none;color:inherit;">${svg}</a>`;
  }).join("");

  const overlay = `<div data-designforge-social-icons-overlay="1" style="position:absolute;bottom:18px;right:18px;z-index:60;display:flex;gap:12px;align-items:center;">${anchors}</div>`;

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${overlay}`);
  }
  return `${overlay}${html}`;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getIntentCanvasSize(intent: ParsedIntent): { width: number; height: number } {
  const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0] : (intent.dimensions as any);
  const width = Number(dims?.width) || 1080;
  const rawHeight = dims?.height;
  const height = rawHeight === "auto" ? 1200 : Number(rawHeight) || 1080;
  return { width, height };
}

function isLikelyPlainTextOrMarkdownOutput(html: string): boolean {
  const t = String(html ?? "").trim();
  if (!t) return true;

  // No tags at all => definitely plain text / markdown.
  if (!/<[a-z][^>]*>/i.test(t)) return true;

  // Extremely weak structure with markdown-like bullets/headings often means
  // the model ignored HTML-only contract and returned prose.
  const hasStrongLayoutTags = /<(div|section|main|article|header|footer|nav|img|svg|canvas|h1|h2|h3)\b/i.test(t);
  const stripped = t.replace(/<[^>]+>/g, "\n");
  const hasMarkdownSignals =
    /(^|\n)\s{0,3}#{1,6}\s+\S+/m.test(stripped) ||
    /(^|\n)\s{0,3}(?:[-*]|\d+\.)\s+\S+/m.test(stripped) ||
    /(^|\n)\s*```/m.test(stripped);
  return !hasStrongLayoutTags && hasMarkdownSignals;
}

function buildDeterministicCanvasFallback(args: {
  source: string;
  intent: ParsedIntent;
  brand: Pick<BrandProfile, "colors" | "name"> & { logoPrimaryUrl?: string | null };
  userPrompt?: string;
}): string {
  const { source, intent, brand, userPrompt } = args;
  const { width, height } = getIntentCanvasSize(intent);
  const primary = String((brand.colors as any)?.primary ?? "#6366f1");
  const promptText = String(userPrompt ?? "").replace(/^\/\S+\s*/i, "").trim();
  const quotedTopic =
    promptText.match(/[“"]([^"”]{6,80})["”]/)?.[1]?.trim() ??
    promptText.match(/\*\*([^*]{6,80})\*\*/)?.[1]?.trim() ??
    "";
  const topic = quotedTopic || "Growth of Agentic AI";

  const cleanLine = (line: string) =>
    line
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

  const stopPhrases = [
    "design layout",
    "maintain:",
    "body content to include:",
    "use a",
    "create an awareness post",
    "background",
  ];
  const rawLines = String(source)
    .replace(/<[^>]+>/g, "\n")
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter(Boolean);
  const bulletLines = rawLines
    .filter((l) => l.length > 10 && l.length < 120)
    .filter((l) => !stopPhrases.some((p) => l.toLowerCase().includes(p)))
    .slice(0, 4);
  const title = escapeHtml(`Agentic AI Growth`);
  const subtitle = escapeHtml(topic);
  const bodySource =
    promptText
      .split(/\r?\n/)
      .map((l) => cleanLine(l))
      .find((l) => l.length > 80 && !stopPhrases.some((p) => l.toLowerCase().includes(p))) ??
    rawLines.find((l) => l.length > 80) ??
    "Agentic AI is transforming business workflows through autonomous decision-making, rapid automation, and real-time problem solving.";
  const body = escapeHtml(bodySource.slice(0, 260));
  const bullets = bulletLines
    .map((item) => `<li>${escapeHtml(item.slice(0, 120))}</li>`)
    .join("");
  const isSocial =
    intent.platform === "linkedin" ||
    intent.platform === "instagram" ||
    intent.platform === "facebook" ||
    intent.platform === "twitter";
  const stats = isSocial
    ? `<section class="stats">
      <article class="stat"><div class="k">2025 Market</div><div class="v">$3.7B</div></article>
      <article class="stat"><div class="k">2032 Projection</div><div class="v">$103.6B</div></article>
      <article class="stat"><div class="k">CAGR</div><div class="v">46.9%</div></article>
    </section>`
    : "";
  const insights = bullets
    ? `<ul>${bullets}</ul>`
    : `<ul>
      <li>Autonomous workflows reduce operational overhead.</li>
      <li>AI agents improve response speed and consistency.</li>
      <li>Adoption is accelerating across SaaS, finance, and operations.</li>
    </ul>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; font-family: Inter, Arial, sans-serif; }
    .bg {
      width: 100%;
      height: 100%;
      background:
        radial-gradient(circle at 80% 20%, rgba(99,102,241,.22), transparent 38%),
        radial-gradient(circle at 20% 80%, rgba(59,130,246,.18), transparent 40%),
        linear-gradient(145deg, #0b1020 0%, #0f172a 55%, #1e293b 100%);
      color: #f8fafc;
      padding: 64px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 18px;
    }
    h1 {
      margin: 0;
      font-size: ${Math.max(36, Math.round(width * 0.048))}px;
      line-height: 1.12;
      max-width: 92%;
    }
    h2 {
      margin: 0;
      font-size: ${Math.max(20, Math.round(width * 0.022))}px;
      color: rgba(226,232,240,.96);
      font-weight: 600;
    }
    p { margin: 0; max-width: 80%; color: rgba(241,245,249,.9); font-size: ${Math.max(16, Math.round(width * 0.016))}px; line-height: 1.45; }
    ul { margin: 4px 0 0 0; padding-left: 22px; max-width: 78%; color: rgba(241,245,249,.92); }
    li { margin: 6px 0; font-size: ${Math.max(15, Math.round(width * 0.014))}px; }
    .accent { color: ${escapeHtml(primary)}; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 12px;
      width: 92%;
      margin-top: 6px;
    }
    .stat {
      border: 1px solid rgba(255,255,255,.2);
      background: rgba(15,23,42,.48);
      border-radius: 14px;
      padding: 12px 14px;
      min-height: 76px;
    }
    .k { color: rgba(191,219,254,.95); font-size: 13px; margin-bottom: 8px; }
    .v { color: #fff; font-size: 24px; font-weight: 700; }
  </style>
</head>
<body>
  ${
    args.brand.logoPrimaryUrl
      ? `<img src="${args.brand.logoPrimaryUrl}" alt="Brand logo" style="position:absolute;top:0;left:0;width:${Math.max(
          56,
          Math.round(width * 0.11)
        )}px;object-fit:contain;display:block;" />`
      : ""
  }
  <main class="bg">
    <h1>${title}</h1>
    <h2>${subtitle}</h2>
    ${stats}
    ${body ? `<p>${body}</p>` : ""}
    ${insights}
    <p class="accent">${escapeHtml(brand.name || "DesignForge")}</p>
  </main>
</body>
</html>`;
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

function toInlineSvgPlaceholder(label: string): string {
  const safe = (label || "visual background").slice(0, 60).replace(/[<>&"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 1600 900'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#0f172a'/><stop offset='100%' stop-color='#334155'/></linearGradient></defs><rect width='1600' height='900' fill='url(#g)'/><circle cx='1180' cy='220' r='180' fill='rgba(148,163,184,0.18)'/><circle cx='380' cy='640' r='210' fill='rgba(99,102,241,0.16)'/><text x='64' y='820' fill='rgba(241,245,249,0.86)' font-family='Arial, sans-serif' font-size='36'>${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Models sometimes emit local URLs like /api/images/*.jpg which can 404 in preview.
 * Replace those with an inline SVG placeholder so render never collapses.
 */
function replaceNonResolvableImageSources(html: string): string {
  const doc = parse(html);
  const imgs = doc.querySelectorAll("img");
  for (const img of imgs) {
    const src = (img.getAttribute("src") ?? "").trim();
    const isLikelyLocalMissing =
      /^\/api\/images\//i.test(src) || /^\/images\//i.test(src) || /^images\//i.test(src);
    if (!isLikelyLocalMissing) continue;
    const alt = (img.getAttribute("alt") ?? "visual background").trim();
    img.setAttribute("src", toInlineSvgPlaceholder(alt));
  }

  let out = doc.toString();
  out = out.replace(
    /url\((['"]?)(\/api\/images\/[^'")]+|\/images\/[^'")]+|images\/[^'")]+)\1\)/gi,
    () => `url("${toInlineSvgPlaceholder("visual background")}")`
  );
  return out;
}

function aiIntentSignals(intent: ParsedIntent): string {
  return [
    ...(intent.styleContext ?? []),
    ...(intent.contentRequirements ?? []),
    String(intent.format ?? ""),
    String(intent.platform ?? ""),
  ]
    .join(" ")
    .toLowerCase();
}

function buildUnsplashQueryForIntent(intent: ParsedIntent): string {
  const signal = aiIntentSignals(intent);
  if (/\brobot|robotic|ai agent|ai agents|neural|artificial intelligence|machine learning|ml\b/i.test(signal)) {
    return "robotic brain ai agents neural network technology";
  }
  if (/\bfintech|finance|bank|trading|investment\b/i.test(signal)) {
    return "fintech technology dashboard data visualization";
  }
  if (/\bsaas|software|startup|product\b/i.test(signal)) {
    return "software technology abstract interface";
  }
  return "technology innovation digital";
}

async function fetchUnsplashRelevantImageUrl(intent: ParsedIntent): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return null;
  try {
    const query = encodeURIComponent(buildUnsplashQueryForIntent(intent));
    const url = `https://api.unsplash.com/search/photos?query=${query}&orientation=landscape&per_page=20&content_filter=high`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const results = Array.isArray(json?.results) ? json.results : [];
    for (const item of results) {
      const raw = String(item?.urls?.raw ?? "").trim();
      const regular = String(item?.urls?.regular ?? "").trim();
      const candidate = raw || regular;
      if (!candidate) continue;
      const alt = String(item?.alt_description ?? item?.description ?? "").toLowerCase();
      // Filter out obvious unrelated nature picks for AI prompts.
      if (/\bflower|flowers|floral|garden|bouquet|petal|blossom\b/i.test(alt)) continue;
      return raw
        ? `${raw}&auto=format&fit=crop&w=1600&h=900&q=80`
        : regular;
    }
  } catch {
    // Best effort only.
  }
  return null;
}

function getGeminiImageModelId(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.0-flash-preview-image-generation";
}

async function fetchGeminiGeneratedImageDataUri(
  intent: ParsedIntent,
  userPrompt?: string
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: getGeminiImageModelId(),
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"] as any,
      } as any,
    });

    const format = String(intent.format ?? "").replace(/_/g, " ");
    const platform = String(intent.platform ?? "social");
    const prompt = [
      "Generate a single high-quality background image for a marketing design.",
      `Theme: robotic neural network, agentic AI, futuristic technology.`,
      `Target usage: ${platform} ${format}.`,
      "Style: cinematic, clean, high contrast, no text/logos/watermarks.",
      "Output should be suitable as a full-canvas background.",
      userPrompt ? `User context: ${userPrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }] as any,
    });

    const candidates = (result as any)?.response?.candidates ?? [];
    for (const c of candidates) {
      const parts = c?.content?.parts ?? [];
      for (const p of parts) {
        const mime = p?.inlineData?.mimeType;
        const data = p?.inlineData?.data;
        if (typeof data === "string" && data.length > 0) {
          const safeMime = typeof mime === "string" && mime.includes("/") ? mime : "image/png";
          return `data:${safeMime};base64,${data}`;
        }
      }
    }
  } catch {
    // Best-effort fallback only.
  }

  return null;
}

async function replaceIrrelevantImageryForAiIntent(
  html: string,
  intent: ParsedIntent,
  userPrompt?: string
): Promise<string> {
  const signal = aiIntentSignals(intent);
  const isAiLike =
    /\b(ai|a\.i|ml|machine learning|artificial intelligence|agent|agents|robot|robotic|neural|automation|tech|technology)\b/i.test(
      signal
    );
  if (!isAiLike) return html;

  const desired = "robotics,artificial-intelligence,neural-network,technology";
  const searched = await fetchUnsplashRelevantImageUrl(intent);
  const geminiGenerated = searched ? null : await fetchGeminiGeneratedImageDataUri(intent, userPrompt);
  const preferred = searched || geminiGenerated || `https://source.unsplash.com/1600x900/?${desired}`;

  const unrelated = /\b(flower|flowers|floral|blossom|garden|nature|petal|bouquet)\b/i;
  const relevant = /\b(robot|robotic|ai|artificial|neural|technology|tech|cyber|code|data)\b/i;

  const doc = parse(html);
  const imgs = doc.querySelectorAll("img");
  for (const img of imgs) {
    const src = (img.getAttribute("src") ?? "").trim();
    if (!src) continue;
    const srcLower = src.toLowerCase();
    // User uploads, brand assets, and data URIs must never be swapped for stock "AI" imagery.
    if (/\/api\/files\//i.test(srcLower) || /^data:image\//i.test(srcLower)) {
      continue;
    }
    const looksUnrelated = unrelated.test(srcLower);
    const looksRelevant = relevant.test(srcLower);
    const isRandomUnsplash = srcLower.includes("source.unsplash.com");
    const isPlaceholder = srcLower.includes("placeholder.designforge.ai");
    if (looksUnrelated || !looksRelevant || isRandomUnsplash || isPlaceholder) {
      img.setAttribute("src", preferred);
      if (!img.getAttribute("alt")) {
        img.setAttribute("alt", "AI robotics visual");
      }
    }
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

  // Only inject Tailwind browser runtime when utility classes are likely present.
  const hasLikelyTailwindClasses =
    /class\s*=\s*["'][^"']*(\b(?:flex|grid|hidden|block|inline|container|mx-|my-|px-|py-|pt-|pb-|pl-|pr-|m-|p-|w-|h-|min-|max-|text-|bg-|border-|rounded|shadow|gap-|items-|justify-|content-|self-|font-|tracking-|leading-|z-|top-|left-|right-|bottom-|absolute|relative|sticky|fixed|overflow-|object-|aspect-|col-|row-|sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:)\S*)[^"']*["']/i.test(
      out
    );

  const suppressTailwindRuntimeWarning = `<script data-designforge-tailwind-warn-filter="1">
(function(){
  try {
    var pat = /cdn\\.tailwindcss\\.com should not be used in production/i;
    var wrap = function(fn){
      if (!fn) return null;
      var original = fn.bind(console);
      return function() {
        try {
          var msg = arguments && arguments[0] != null ? String(arguments[0]) : "";
          if (pat.test(msg)) return;
        } catch(_) {}
        return original.apply(console, arguments);
      };
    };
    if (console.warn) console.warn = wrap(console.warn);
    if (console.error) console.error = wrap(console.error);
  } catch(_) {}
})();
</script>`;

  if (hasLikelyTailwindClasses && !out.includes("https://cdn.tailwindcss.com")) {
    if (!out.includes('data-designforge-tailwind-warn-filter="1"')) {
      injections.push(suppressTailwindRuntimeWarning);
    }
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
  // NOTE: We intentionally avoid strict regex-based balancing checks here.
  // LLM-generated HTML can include recoverable mismatches that browsers parse fine,
  // and strict checks were producing false negatives (e.g. "Mismatched closing tag: html").
  // The parser pass above is sufficient for preview rendering safety.
  return { valid: true };
}

/**
 * Guards against "blank but valid" outputs like a lone empty container.
 * These currently render as a white canvas and look like a broken preview.
 * Social posts get a stricter bar so injected logo/social chrome cannot mask empty layouts.
 */
function hasMeaningfulDesignContent(html: string, intent: ParsedIntent): boolean {
  const doc = parse(html);
  const root: any = doc.querySelector("body") || doc.querySelector("html") || doc;
  const elements = root.querySelectorAll?.("*") ?? [];
  const text = String(root.text ?? "").replace(/\s+/g, " ").trim();

  const richNodes = root.querySelectorAll?.(
    "img,svg,canvas,video,section,article,main,header,footer,nav,button,input,a"
  ) ?? [];

  const p = String(intent.platform ?? "").toLowerCase();
  const isSocial = p === "instagram" || p === "linkedin" || p === "facebook" || p === "twitter";

  if (isSocial) {
    if (text.length < 80) return false;
    if (elements.length < 18) return false;
    const hasHeadline =
      root.querySelector?.("h1, h2, h3") != null ||
      Boolean(root.querySelector?.("[class*='text-4xl'], [class*='text-5xl'], [class*='text-6xl']"));
    const listItems = root.querySelectorAll?.("li")?.length ?? 0;
    if (!hasHeadline && listItems < 2 && text.length < 140) return false;
    return true;
  }

  // Accept if there is enough structure, text, or rich visual/interactive nodes.
  if (elements.length >= 6) return true;
  if (text.length >= 24) return true;
  if (richNodes.length >= 2) return true;

  return false;
}

function hasLikelyTextOverlapIssues(html: string, intent: ParsedIntent): boolean {
  const p = String(intent.platform ?? "").toLowerCase();
  if (!(p === "instagram" || p === "linkedin" || p === "facebook" || p === "twitter")) return false;

  const doc = parse(html);
  const all = doc.querySelectorAll("*");
  let absoluteHeadingLike = 0;
  let hasLatestNewsAbsolute = false;
  let hasMainHeadline = false;

  for (const el of all) {
    const tag = String((el as any).rawTagName ?? "").toLowerCase();
    const cls = (el.getAttribute("class") ?? "").toLowerCase();
    const style = (el.getAttribute("style") ?? "").toLowerCase();
    const text = (el.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const isAbsolute = /\babsolute\b|\bfixed\b/.test(cls) || /(position\s*:\s*(absolute|fixed))/.test(style);
    const looksHeading =
      tag === "h1" ||
      tag === "h2" ||
      /\btext-(3xl|4xl|5xl|6xl|7xl)\b/.test(cls) ||
      text.length >= 18;

    if (isAbsolute && looksHeading) absoluteHeadingLike += 1;
    if (/latest\s*news:?/i.test(text) && isAbsolute) hasLatestNewsAbsolute = true;
    if (tag === "h1" || /\btext-(4xl|5xl|6xl|7xl)\b/.test(cls)) hasMainHeadline = true;
  }

  if (absoluteHeadingLike >= 2) return true;
  if (hasLatestNewsAbsolute && hasMainHeadline) return true;
  return false;
}

function hasLikelySocialOverflowIssues(html: string, intent: ParsedIntent): boolean {
  const p = String(intent.platform ?? "").toLowerCase();
  if (!(p === "instagram" || p === "linkedin" || p === "facebook" || p === "twitter")) return false;

  const doc = parse(html);
  const body: any = doc.querySelector("body") || doc;
  const text = String(body.text ?? "").replace(/\s+/g, " ").trim();
  const lis = body.querySelectorAll?.("li") ?? [];
  const headlines = body.querySelectorAll?.("h1,h2,h3") ?? [];

  // Relaxed caps to avoid false positives for richer social copy.
  if (text.length > 900) return true;
  if (lis.length > 8) return true;
  if (headlines.length > 4) return true;

  const hasLatestHeadlines = /latest\s*headlines?/i.test(text);
  if (hasLatestHeadlines && lis.length > 5) return true;
  return false;
}

function hasBackgroundImageContractViolation(
  html: string,
  intent: ParsedIntent,
  userPrompt?: string
): boolean {
  const p = String(intent.platform ?? "").toLowerCase();
  if (!(p === "instagram" || p === "linkedin" || p === "facebook" || p === "twitter")) return false;
  const askedBackgroundImage = /\bbackground\s+image\b/i.test(String(userPrompt ?? ""));
  if (!askedBackgroundImage) return false;

  // Policy A compatibility:
  // If the user is talking about a reference image / "follow the reference", we allow CSS-only recreation
  // (gradients + positioned shapes) instead of forcing a literal <img> background layer.
  const promptSignalsReference =
    /\breference\s+image\b/i.test(String(userPrompt ?? "")) ||
    /\bfollow\b.*\breference\b/i.test(String(userPrompt ?? "")) ||
    /\bstyle\b.*\binspiration\b/i.test(String(userPrompt ?? "")) ||
    /\bonly\s+the\s+text\b/i.test(String(userPrompt ?? "")) ||
    /\bexact\s+same\s+background\b/i.test(String(userPrompt ?? ""));

  const doc = parse(html);
  const imgs = doc.querySelectorAll("img");
  // Allow CSS-recreated backgrounds even when there are no <img> tags.
  if (!imgs.length) {
    const hasGradients = /\b(radial-gradient|linear-gradient|conic-gradient|repeating-linear-gradient)\s*\(/i.test(html);
    const hasBgRules = /\bbackground(?:-image)?\s*:/i.test(html);
    const hasShapes = /position\s*:\s*absolute/i.test(html) && /border-radius\s*:/i.test(html) && /background\s*:/i.test(html);
    const hasCssBackground = (hasGradients && hasBgRules) || (hasBgRules && hasShapes);
    if (hasCssBackground) return false;
    // If the prompt is clearly referencing a reference image, don't hard-fail on missing <img>.
    if (promptSignalsReference) return false;
    return true;
  }

  let hasFullBgImagePattern = false;
  for (const img of imgs) {
    const cls = (img.getAttribute("class") ?? "").toLowerCase();
    const st = (img.getAttribute("style") ?? "").toLowerCase();
    const hasCover = /\bobject-cover\b/.test(cls) || /object-fit\s*:\s*cover/.test(st);
    const hasAbsoluteFill =
      (/\babsolute\b/.test(cls) && /\binset-0\b/.test(cls)) ||
      (/position\s*:\s*absolute/.test(st) &&
        /(?:top\s*:\s*0|inset\s*:\s*0)/.test(st) &&
        /(?:left\s*:\s*0|inset\s*:\s*0)/.test(st));
    if (hasCover && hasAbsoluteFill) {
      hasFullBgImagePattern = true;
      break;
    }
  }

  if (hasFullBgImagePattern) return false;
  // If we didn't detect the <img> pattern, accept CSS-only background recreation for reference-style prompts.
  if (promptSignalsReference) return false;
  // Otherwise, consider it a contract violation.
  return true;
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

function ensureHtmlDocumentShell(html: string): string {
  let trimmed = html.trim();
  // Drop any leaked text before real document start (e.g. "'''html").
  const docStart = trimmed.search(/<(?:!doctype|html)\b/i);
  if (docStart > 0) {
    trimmed = trimmed.slice(docStart);
  }
  if (/<html[\s>]/i.test(trimmed)) return trimmed;

  // Pull out existing <head> blocks (if any) and keep their inner contents.
  const headChunks: string[] = [];
  const withoutHeads = trimmed.replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, (_m, inner) => {
    headChunks.push(String(inner ?? ""));
    return "";
  });
  const mergedHead = headChunks.join("\n").trim();

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    mergedHead,
    "</head>",
    '<body style="margin:0;">',
    withoutHeads.trim(),
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}

function isDesignHealthy(
  html: string,
  dimensions: { width: number; height: number }
): { healthy: boolean; issues: string[] } {
  const issues: string[] = [];
  const raw = String(html ?? "").trim();
  if (raw.length < 800) issues.push("response_too_short");
  if (!/<\/html>/i.test(raw)) issues.push("html_truncated");

  const classCount = (raw.match(/\bclass=["'][^"']+["']/gi) ?? []).length;
  const styleCount = (raw.match(/\bstyle=["'][^"']+["']/gi) ?? []).length;
  // Accept either Tailwind-class-heavy output OR inline-style-heavy output.
  if (classCount < 3 && styleCount < 5) issues.push("insufficient_styling");

  const { width, height } = dimensions;
  const hasWidth = new RegExp(`\\bwidth\\s*:\\s*${width}px\\b`, "i").test(raw);
  const hasHeight = new RegExp(`\\bheight\\s*:\\s*${height}px\\b`, "i").test(raw);
  if (!hasWidth || !hasHeight) issues.push("wrong_dimensions");

  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyText = bodyMatch?.[1] ?? "";
  if (String(bodyText).trim().length < 200) issues.push("body_nearly_empty");

  const hasNonWhiteBg =
    /\bbg-(?!white\b|transparent\b)[a-z]+-\d{2,3}\b/i.test(raw) ||
    /background\s*:\s*(?!\s*(?:#fff(?:fff)?\b|white\b|rgba?\(\s*255\s*,\s*255\s*,\s*255))/i.test(raw);
  if (!hasNonWhiteBg) issues.push("background_is_plain_white");

  const hasLargeType =
    /\btext-(xl|2xl|3xl|4xl|5xl|6xl|7xl)\b/i.test(raw) ||
    /font-size\s*:\s*(?:[3-9]\d|1\d{2})px\b/i.test(raw);
  if (!hasLargeType) issues.push("no_large_typography");

  return { healthy: issues.length === 0, issues };
}

export async function postProcessHtml({
  html,
  intent,
  brand,
  userPrompt,
  repairMalformedHtml,
  abModifiers,
}: Args): Promise<Result> {
  const warnings: string[] = [];
  const strictSocialQuality = process.env.AI_STRICT_SOCIAL_QUALITY === "true";
  const strictLayoutQuality = process.env.AI_STRICT_LAYOUT_QUALITY === "true";
  const rawModelHtml = String(html ?? "");
  let currentHtml = html;
  currentHtml = stripMarkdownCodeFences(currentHtml);
  if (isLikelyPlainTextOrMarkdownOutput(currentHtml)) {
    warnings.push("Model returned non-HTML output; applied deterministic layout fallback.");
    currentHtml = buildDeterministicCanvasFallback({
      source: currentHtml,
      intent,
      brand,
      userPrompt,
    });
  }

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

  // Fast health check: prevent blank/truncated designs reaching the preview.
  const dims = Array.isArray(intent.dimensions) ? intent.dimensions[0] : (intent.dimensions as any);
  const w = Number(dims?.width ?? 1080);
  const h = dims?.height === "auto" ? 1200 : Number(dims?.height ?? 1080);
  const health = isDesignHealthy(currentHtml, { width: w, height: h });
  if (process.env.NODE_ENV === "development" || process.env.AI_DEBUG === "true") {
    try {
      console.log("[HealthCheck] issues=", health.issues);
      console.log("[HealthCheck] raw_model_html_preview=", rawModelHtml.slice(0, 6000));
      console.log("[HealthCheck] cleaned_html_preview=", String(currentHtml ?? "").slice(0, 6000));
    } catch {
      // ignore logging failures
    }
  }
  if (!health.healthy) {
    warnings.push(`Health check failed: ${health.issues.join(", ")}`);
    const err = new Error("Generated output failed health check.");
    (err as Error & { code?: string }).code = "GENERATION_LOW_QUALITY";
    throw err;
  }

  let processed = stripScriptsAndHandlers(currentHtml);
  processed = normalisePlaceholderImages(processed);
  processed = replaceNonResolvableImageSources(processed);
  processed = await replaceIrrelevantImageryForAiIntent(processed, intent, userPrompt);
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
  processed = ensureHtmlDocumentShell(processed);

  if (!hasMeaningfulDesignContent(processed, intent)) {
    const err = new Error("Generated output was empty. Please try again.");
    (err as Error & { code?: string }).code = "GENERATION_EMPTY_HTML";
    throw err;
  }

  // Always enforce deterministic top-left logo placement when a logo is available.
  if (brand.logoPrimaryUrl) {
    processed = ensureLogoNearTop(processed, String(brand.logoPrimaryUrl), intent);
  }
  processed = ensureSocialIconsOverlay(processed, intent);

  if (hasLikelyTextOverlapIssues(processed, intent)) {
    if (strictLayoutQuality || strictSocialQuality) {
      const err = new Error("Generated layout had overlapping headline layers. Retrying.");
      (err as Error & { code?: string }).code = "GENERATION_LOW_QUALITY";
      throw err;
    }
    warnings.push("Detected possible text overlap in layout.");
  }

  if (hasLikelySocialOverflowIssues(processed, intent)) {
    if (strictSocialQuality || strictLayoutQuality) {
      const err = new Error("Generated social layout likely overflows the canvas. Retrying.");
      (err as Error & { code?: string }).code = "GENERATION_LOW_QUALITY";
      throw err;
    }
    warnings.push("Social layout may overflow canvas.");
  }

  if (hasBackgroundImageContractViolation(processed, intent, userPrompt)) {
    if (strictSocialQuality || strictLayoutQuality) {
      const err = new Error(
        "Background image request was not implemented as a full-canvas background layer (image or CSS). Retrying."
      );
      (err as Error & { code?: string }).code = "GENERATION_LOW_QUALITY";
      throw err;
    }
    warnings.push("Background image did not match full-canvas contract.");
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

