import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageBytes } from "../nodeCreator";

describe("fetchImageBytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes data:image PNG base64", async () => {
    const png1x1 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bytes = await fetchImageBytes(png1x1);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBeGreaterThan(10);
  });

  it("uses global fetch for http URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      })
    );
    const bytes = await fetchImageBytes("https://example.com/a.png");
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(3);
  });
});
