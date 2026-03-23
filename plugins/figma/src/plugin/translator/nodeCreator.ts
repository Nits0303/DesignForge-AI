import type { ParsedNode } from "../../shared/types";
import type { TranslationReport } from "../../shared/types";
import { resolveClassList } from "./tailwindResolver";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(n, 16);
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Main-thread fetch for <img> — avoids iframe CORS; supports data: URLs. */
export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  if (url.startsWith("data:")) {
    const m = /^data:image\/[^;]+;base64,(.+)$/i.exec(url);
    if (!m) return null;
    try {
      return base64ToUint8Array(m[1]!);
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

export function resolveAssetUrl(src: string, baseUrl?: string): string {
  const s = src.trim();
  if (!s) return s;
  if (s.startsWith("data:") || /^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (baseUrl) {
    try {
      return new URL(s, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
    } catch {
      return s;
    }
  }
  return s;
}

function shadowEffects(level: "sm" | "md" | "lg" | "xl" | "2xl"): DropShadowEffect[] {
  const presets: Record<string, { r: number; y: number; a: number }> = {
    sm: { r: 4, y: 1, a: 0.12 },
    md: { r: 8, y: 4, a: 0.15 },
    lg: { r: 16, y: 8, a: 0.18 },
    xl: { r: 24, y: 12, a: 0.2 },
    "2xl": { r: 32, y: 16, a: 0.25 },
  };
  const p = presets[level] ?? presets.md!;
  return [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: p.a },
      offset: { x: 0, y: p.y },
      radius: p.r,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
}

export type TranslateOptions = {
  assetsBaseUrl?: string;
};

export async function translateTree(
  root: ParsedNode | null,
  options: TranslateOptions = {}
): Promise<{ frame: FrameNode; report: TranslationReport }> {
  const started = Date.now();
  const layersByType = { frame: 0, text: 0, image: 0, rectangle: 0 };
  const unsupportedClasses: string[] = [];
  const fontsLoaded: string[] = [];
  const fontSubs: { original: string; substituted: string }[] = [];

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  fontsLoaded.push("Inter Regular");

  const baseUrl = options.assetsBaseUrl?.trim();

  const top = figma.createFrame();
  top.name = "DesignForge Import";
  top.layoutMode = "VERTICAL";
  top.primaryAxisSizingMode = "AUTO";
  top.counterAxisSizingMode = "AUTO";
  top.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  layersByType.frame++;

  let imagesLoaded = 0;
  let imagesFailed = 0;

  async function applyFrameVisuals(frame: FrameNode, styles: Record<string, unknown>) {
    if (typeof styles.widthPx === "number") frame.resize(styles.widthPx, frame.height);
    if (typeof styles.heightPx === "number") frame.resize(frame.width, styles.heightPx);
    if (typeof styles.fillHex === "string") {
      frame.fills = [{ type: "SOLID", color: hexToRgb(styles.fillHex) }];
    }
    if (typeof styles.paddingTop === "number") {
      frame.paddingTop = styles.paddingTop;
      frame.paddingRight = (styles.paddingRight as number) ?? styles.paddingTop;
      frame.paddingBottom = (styles.paddingBottom as number) ?? styles.paddingTop;
      frame.paddingLeft = (styles.paddingLeft as number) ?? styles.paddingTop;
    }
    if (typeof styles.gapPx === "number" && frame.layoutMode !== "NONE") {
      frame.itemSpacing = styles.gapPx;
    }
    if (typeof styles.borderRadiusPx === "number") {
      frame.cornerRadius = styles.borderRadiusPx;
    }
    if (typeof styles.shadow === "string") {
      frame.effects = shadowEffects(styles.shadow as "sm" | "md" | "lg" | "xl" | "2xl");
    }
    if (typeof styles.borderWidthPx === "number" && styles.borderWidthPx > 0) {
      frame.strokeWeight = styles.borderWidthPx;
      const hex = (typeof styles.borderHex === "string" ? styles.borderHex : "#000000") as string;
      frame.strokes = [{ type: "SOLID", color: hexToRgb(hex) }];
    }
  }

  async function walk(node: ParsedNode, parent: FrameNode) {
    const { styles, uncovered } = resolveClassList(node.classList);
    unsupportedClasses.push(...uncovered);

    const st = styles as Record<string, unknown>;

    if (node.tagName === "img") {
      const src = node.attributes.src ?? node.attributes["data-src"] ?? "";
      const resolved = resolveAssetUrl(src, baseUrl);
      const bytes = resolved ? await fetchImageBytes(resolved) : null;
      const w = typeof st.widthPx === "number" ? st.widthPx : 200;
      const h = typeof st.heightPx === "number" ? st.heightPx : 200;

      if (bytes && bytes.length > 0) {
        const image = figma.createImage(bytes);
        const rect = figma.createRectangle();
        rect.name = node.attributes.alt || "Image";
        rect.resize(w, h);
        rect.fills = [
          {
            type: "IMAGE",
            imageHash: image.hash,
            scaleMode: "FILL",
          },
        ];
        if (typeof st.borderRadiusPx === "number") {
          rect.cornerRadius = st.borderRadiusPx;
        }
        parent.appendChild(rect);
        layersByType.rectangle++;
        imagesLoaded++;
        return;
      }

      const placeholder = figma.createFrame();
      placeholder.name = "Image (failed)";
      placeholder.resize(w, h);
      placeholder.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
      parent.appendChild(placeholder);
      layersByType.frame++;
      imagesFailed++;
      return;
    }

    const textTag =
      ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "label", "a"].includes(node.tagName) && node.textContent;
    const buttonText = node.tagName === "button" && node.textContent;

    if ((textTag || buttonText) && node.textContent) {
      const t = figma.createText();
      t.characters = node.textContent.slice(0, 2000);
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      if (typeof st.textHex === "string") {
        t.fills = [{ type: "SOLID", color: hexToRgb(st.textHex) }];
      }
      t.fontSize = typeof st.fontSizePx === "number" ? st.fontSizePx : 14;
      if (typeof st.fontWeight === "number") {
        try {
          const w = st.fontWeight as number;
          const bold = w >= 600;
          await figma.loadFontAsync({ family: "Inter", style: bold ? "Bold" : "Regular" });
          t.fontName = { family: "Inter", style: bold ? "Bold" : "Regular" };
        } catch {
          /* keep Regular */
        }
      }
      if (typeof st.opacity === "number") {
        t.opacity = st.opacity;
      }
      parent.appendChild(t);
      layersByType.text++;
      return;
    }

    const frame = figma.createFrame();
    frame.name = (node.attributes.id as string) || node.tagName || "frame";
    const dir = st.flexDirection === "row" ? "HORIZONTAL" : "VERTICAL";
    frame.layoutMode = st.display === "flex" ? dir : "VERTICAL";
    if (st.flexWrap === "wrap") {
      frame.layoutWrap = "WRAP";
    }
    if (st.alignItems === "center" || st.alignItems === "stretch") {
      frame.counterAxisAlignItems = st.alignItems === "stretch" ? "MIN" : "CENTER";
    } else if (st.alignItems === "start" || st.alignItems === "flex-start") {
      frame.counterAxisAlignItems = "MIN";
    } else if (st.alignItems === "end" || st.alignItems === "flex-end") {
      frame.counterAxisAlignItems = "MAX";
    }
    if (st.justifyContent === "center") frame.primaryAxisAlignItems = "CENTER";
    else if (st.justifyContent === "space-between") frame.primaryAxisAlignItems = "SPACE_BETWEEN";
    else if (st.justifyContent === "start" || st.justifyContent === "flex-start") {
      frame.primaryAxisAlignItems = "MIN";
    } else if (st.justifyContent === "end" || st.justifyContent === "flex-end") {
      frame.primaryAxisAlignItems = "MAX";
    } else if (st.justifyContent === "space-around" || st.justifyContent === "space-evenly") {
      frame.primaryAxisAlignItems = "CENTER";
    }

    await applyFrameVisuals(frame, st);

    parent.appendChild(frame);
    layersByType.frame++;

    for (const ch of node.children) {
      await walk(ch, frame);
    }
  }

  if (root) {
    if (root.children.length) {
      for (const ch of root.children) await walk(ch, top);
    } else {
      await walk(root, top);
    }
  }

  const layerCount =
    layersByType.frame + layersByType.text + layersByType.image + layersByType.rectangle;

  const report: TranslationReport = {
    layerCount,
    layersByType,
    fontsLoaded,
    fontSubstitutions: fontSubs,
    imagesLoaded,
    imagesFailed,
    unsupportedClasses: Array.from(new Set(unsupportedClasses)),
    translationTimeMs: Date.now() - started,
  };

  return { frame: top, report };
}
