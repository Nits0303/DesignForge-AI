import { describe, expect, it } from "vitest";
import { normalizeHtmlInput, parseHtmlToTree } from "../htmlParser";

describe("normalizeHtmlInput", () => {
  it("returns plain HTML unchanged when not a JSON array", () => {
    const h = "<div class='p-4'>x</div>";
    expect(normalizeHtmlInput(h)).toBe(h);
  });

  it("wraps JSON string array screens in a vertical stack", () => {
    const screens = ['<div class="p-2">A</div>', '<div class="p-2">B</div>'];
    const out = normalizeHtmlInput(JSON.stringify(screens));
    expect(out).toContain('data-screen-index="0"');
    expect(out).toContain('data-screen-index="1"');
    expect(out).toContain("A");
    expect(out).toContain("B");
  });

  it("parses wrapped multi-screen HTML into a tree", () => {
    const screens = ['<div class="flex p-4">Screen1</div>'];
    const normalized = normalizeHtmlInput(JSON.stringify(screens));
    const tree = parseHtmlToTree(normalized);
    expect(tree).not.toBeNull();
    expect(tree!.children.length).toBeGreaterThan(0);
  });
});
