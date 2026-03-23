export type RevisionPatternType =
  | "headline_resize"
  | "bg_color_change"
  | "font_swap"
  | "spacing_adjust"
  | "cta_addition"
  | "layout_change"
  | "other";

export type RevisionPattern =
  | {
      type: "headline_resize";
      direction: "larger" | "smaller";
    }
  | {
      type: "bg_color_change";
      direction: "dark" | "light";
    }
  | {
      type: "font_swap";
      fontName?: string;
    }
  | {
      type: "spacing_adjust";
      direction: "more_space" | "less_space";
    }
  | {
      type: "cta_addition";
    }
  | {
      type: "layout_change";
    }
  | {
      type: "other";
    };

function containsNear(text: string, needles: string[], anchors: string[]): boolean {
  const lower = text.toLowerCase();
  for (const needle of needles) {
    const idx = lower.indexOf(needle);
    if (idx === -1) continue;
    const windowStart = Math.max(0, idx - 40);
    const windowEnd = idx + needle.length + 40;
    const window = lower.slice(windowStart, windowEnd);
    if (anchors.some((a) => window.includes(a))) return true;
  }
  return false;
}

export function classifyRevision(text: string): RevisionPattern {
  const lower = text.toLowerCase();

  if (
    containsNear(
      lower,
      ["bigger", "larger", "increase size", "make it larger", "scale up"],
      ["headline", "title", "heading", "text", "font"]
    )
  ) {
    return { type: "headline_resize", direction: "larger" };
  }

  if (
    containsNear(
      lower,
      ["smaller", "decrease", "reduce size"],
      ["headline", "title", "heading", "text", "font"]
    )
  ) {
    return { type: "headline_resize", direction: "smaller" };
  }

  if (
    containsNear(
      lower,
      ["dark", "darker", "black", "night", "deep"],
      ["background", "bg", "backdrop"]
    )
  ) {
    return { type: "bg_color_change", direction: "dark" };
  }

  if (
    containsNear(
      lower,
      ["light", "lighter", "white", "bright"],
      ["background", "bg", "backdrop"]
    )
  ) {
    return { type: "bg_color_change", direction: "light" };
  }

  if (lower.includes("font") || lower.includes("typeface") || lower.includes("typography")) {
    const match = lower.match(/font\s+([a-z0-9\s\-]+)/i);
    const fontName = match?.[1]?.trim();
    return { type: "font_swap", fontName };
  }

  if (/(spacing|padding|gap|space|room|tight|spread)/i.test(text)) {
    const lowerText = lower;
    const looksMore =
      /(more|increase|bigger|larger|looser|wider|spread|room)/i.test(lowerText) ||
      /(add|extra)\s+(padding|gap|space|spacing)/i.test(lowerText);
    const looksLess =
      /(less|decrease|smaller|tighter|compact|reduce|narrow)/i.test(lowerText) ||
      /(remove|less)\s+(padding|gap|space|spacing)/i.test(lowerText);

    if (looksMore && !looksLess) return { type: "spacing_adjust", direction: "more_space" };
    if (looksLess && !looksMore) return { type: "spacing_adjust", direction: "less_space" };

    // Default to "more_space" when ambiguous; user corrections will refine over time.
    return { type: "spacing_adjust", direction: "more_space" };
  }

  if (/(button|cta|call to action|click here|learn more|sign up)/i.test(text)) {
    return { type: "cta_addition" };
  }

  if (/(layout|structure|rearrange|move|swap|flip|column|row)/i.test(text)) {
    return { type: "layout_change" };
  }

  return { type: "other" };
}

