import { describe, expect, it } from "vitest";
import { resolveClassList } from "../tailwindResolver";

describe("resolveClassList", () => {
  it("maps w-4 to width 16px scale", () => {
    const { styles } = resolveClassList(["w-4"]);
    expect(styles.widthPx).toBe(16);
  });

  it("later conflicting classes override earlier (merge order)", () => {
    const { styles } = resolveClassList(["w-4", "w-8"]);
    expect(styles.widthPx).toBe(32);
  });

  it("collects uncovered classes", () => {
    const { uncovered } = resolveClassList(["w-4", "not-a-real-tw-class-xyz"]);
    expect(uncovered).toContain("not-a-real-tw-class-xyz");
  });

  it("maps arbitrary bg-[#hex] and w-[100px]", () => {
    const { styles } = resolveClassList(["bg-[#ff0000]", "w-[100px]"]);
    expect(styles.fillHex).toBe("#ff0000");
    expect(styles.widthPx).toBe(100);
  });

  it("maps palette bg-gray-500", () => {
    const { styles } = resolveClassList(["bg-gray-500"]);
    expect(styles.fillHex).toMatch(/^#/);
  });
});
