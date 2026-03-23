import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHtmlToTree } from "../htmlParser";
import { createMinimalFigmaMock } from "./figmaMock";

describe("translateTree (mock figma)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("figma", createMinimalFigmaMock());
  });

  it("creates a frame with text and increments layer counts", async () => {
    const { translateTree } = await import("../nodeCreator");
    const tree = parseHtmlToTree(`<div class="flex flex-col p-4"><p class="text-slate-600">Hello</p></div>`);
    const { frame, report } = await translateTree(tree);
    expect(frame).toBeDefined();
    expect(report.layerCount).toBeGreaterThan(0);
    expect(report.layersByType.text).toBeGreaterThan(0);
  });

  it("renders img with data URL via createRectangle + IMAGE fill", async () => {
    const png1x1 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const { translateTree } = await import("../nodeCreator");
    const tree = parseHtmlToTree(`<div><img src="${png1x1}" class="w-8 h-8" alt="x" /></div>`);
    const { report } = await translateTree(tree);
    expect(report.imagesLoaded).toBe(1);
    expect(report.imagesFailed).toBe(0);
  });
});
