import { vi } from "vitest";

export function createMinimalFigmaMock() {
  const appendChild = vi.fn();
  return {
    loadFontAsync: vi.fn().mockResolvedValue(undefined),
    createImage: vi.fn((bytes: Uint8Array) => {
      void bytes;
      return { hash: `h${Math.random().toString(36).slice(2)}` };
    }),
    createRectangle: vi.fn(() => ({
      name: "",
      resize: vi.fn(),
      fills: [] as unknown[],
      cornerRadius: 0,
    })),
    createFrame: vi.fn(() => ({
      id: `frame_${Math.random().toString(36).slice(2)}`,
      name: "",
      layoutMode: "VERTICAL",
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "AUTO",
      fills: [] as unknown[],
      cornerRadius: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      itemSpacing: 0,
      layoutWrap: "NO_WRAP",
      primaryAxisAlignItems: "MIN",
      counterAxisAlignItems: "MIN",
      effects: [] as unknown[],
      strokes: [] as unknown[],
      strokeWeight: 0,
      appendChild,
      resize: vi.fn(),
    })),
    createText: vi.fn(() => ({
      characters: "",
      fills: [] as unknown[],
      fontSize: 14,
      fontName: { family: "Inter", style: "Regular" },
      opacity: 1,
    })),
    currentPage: { appendChild: vi.fn() },
    viewport: { center: { x: 400, y: 300 } },
  };
}
