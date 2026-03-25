import type { ParsedIntent } from "@/types/ai";
import type { Platform } from "@/types/design";
import { PLATFORM_SPECS } from "@/constants/platforms";

export type ShortcodeParseResult = {
  platform: Platform;
  format?: string;
  count?: number;
  remainingPrompt: string;
};

const PLATFORM_KEYS = Object.keys(PLATFORM_SPECS) as Platform[];

export function parseShortcode(prompt: string): ShortcodeParseResult | null {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return null;

  const first = parts[0]!.slice(1).toLowerCase();
  const platform = PLATFORM_KEYS.find((p) => p.toLowerCase() === first) as Platform | undefined;
  if (!platform) return null;

  let format: string | undefined;
  let count: number | undefined;
  let index = 1;

  if (parts[index]) {
    const maybeFormat1 = parts[index]!.toLowerCase();
    const maybeFormat2 = parts[index + 1]?.toLowerCase();

    // Support multi-word formats from prompts like: "/website landing page"
    // by joining the next token with '_' (landing_page).
    const joined = maybeFormat2 ? `${maybeFormat1}_${maybeFormat2}` : null;

    if (joined && PLATFORM_SPECS[platform].supportedFormats.includes(joined)) {
      format = joined;
      index += 2;
    } else if (PLATFORM_SPECS[platform].supportedFormats.includes(maybeFormat1)) {
      format = maybeFormat1;
      index += 1;
    }
  }

  if (parts[index]) {
    const num = parseInt(parts[index]!, 10);
    if (!Number.isNaN(num) && num > 0) {
      count = num;
      // Count consumes exactly one token (e.g. "/instagram post 3 ...").
      index += 1;
    }
  }

  const remainingPrompt = parts.slice(index).join(" ").trim();

  return {
    platform,
    format,
    count,
    remainingPrompt,
  };
}

export function shortcodeToPartialIntent(result: ShortcodeParseResult): Partial<ParsedIntent> {
  const spec = PLATFORM_SPECS[result.platform];
  const format = (result.format && spec.supportedFormats.includes(result.format))
    ? result.format
    : spec.supportedFormats[0];

  const dims = spec.defaultDimensions[format] ?? Object.values(spec.defaultDimensions)[0];

  const base: Partial<ParsedIntent> = {
    platform: result.platform,
    format,
    dimensions: dims,
  };

  if (result.count && result.count > 1) {
    if (result.platform === "mobile" || result.platform === "dashboard" || format.includes("screen")) {
      base.screenCount = result.count;
    } else {
      base.slideCount = result.count;
    }
  }

  return base;
}

