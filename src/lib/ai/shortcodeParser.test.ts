import { describe, expect, test } from "vitest";
import { parseShortcode, shortcodeToPartialIntent } from "@/lib/ai/shortcodeParser";

describe("shortcodeParser", () => {
  test("simple shortcode with no modifiers", () => {
    const r = parseShortcode("/instagram New launch");
    expect(r).not.toBeNull();
    expect(r!.platform).toBe("instagram");
    expect(r!.format).toBeUndefined();
    expect(r!.remainingPrompt).toBe("New launch");
    const intent = shortcodeToPartialIntent(r!);
    expect(intent.platform).toBe("instagram");
  });

  test("shortcode with format and count", () => {
    const r = parseShortcode("/instagram carousel 5 slides High energy fitness campaign");
    expect(r).not.toBeNull();
    const intent = shortcodeToPartialIntent(r!);
    expect(intent.slideCount).toBeUndefined();
  });

  test("unrecognised shortcode returns null", () => {
    const r = parseShortcode("/unknown something");
    expect(r).toBeNull();
  });

  test("mixed case shortcode", () => {
    const r = parseShortcode("/InStaGram story Bold promo");
    expect(r).not.toBeNull();
    expect(r!.platform).toBe("instagram");
  });
});

