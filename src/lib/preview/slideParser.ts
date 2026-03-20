import { parse } from "node-html-parser";

export type ParsedSlides = {
  type: "single" | "carousel" | "multi-screen";
  slides: string[];
};

const DESIGN_CONTAINER_ATTR = "data-design-container";

export function parseSlidesFromHtml(fullHtml: string): ParsedSlides {
  const html = fullHtml || "";
  if (!html.trim()) {
    return { type: "single", slides: [html] };
  }

  try {
    // Server-safe parsing (Node worker/API) + client-safe output.
    // We use node-html-parser instead of `document` so this utility works everywhere.
    const rootDoc = parse(html);

    const root = rootDoc.querySelector(`[${DESIGN_CONTAINER_ATTR}]`) as any;
    const mode = ((root as any)?.getAttribute?.(DESIGN_CONTAINER_ATTR) ?? (root as any)?.attrs?.[DESIGN_CONTAINER_ATTR] ?? "")
      .toString()
      .toLowerCase();

    if (!root || (mode !== "carousel" && mode !== "multi-screen")) {
      return { type: "single", slides: [html] };
    }

    const headEl = rootDoc.querySelector("head");
    const headPrefix = headEl?.innerHTML ?? "";

    const slideNodes = (root as any).querySelectorAll?.("[data-slide]") ?? [];
    const sorted = slideNodes
      .slice()
      .sort((a: any, b: any) => {
        const aNum = Number(a?.getAttribute?.("data-slide") ?? a?.attrs?.["data-slide"] ?? "0");
        const bNum = Number(b?.getAttribute?.("data-slide") ?? b?.attrs?.["data-slide"] ?? "0");
        return aNum - bNum;
      });

    if (!sorted.length) return { type: "single", slides: [html] };

    const slides = sorted.map((node: any) => {
      const bodyHtml = node.toString?.() ?? node.outerHTML ?? "";
      const doc = `<!DOCTYPE html><html><head>${headPrefix}</head><body>${bodyHtml}</body></html>`;
      return doc;
    });

    return { type: mode === "carousel" ? "carousel" : "multi-screen", slides };
  } catch {
    return { type: "single", slides: [html] };
  }
}

