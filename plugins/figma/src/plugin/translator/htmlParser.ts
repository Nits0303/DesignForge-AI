import { parse, HTMLElement as HE, TextNode as TN } from "node-html-parser";
import type { ParsedNode } from "../../shared/types";

/**
 * Mobile multi-screen flows store HTML as JSON.stringify(string[]).
 * Wrap each screen in a vertical stack so the translator can process it.
 */
export function normalizeHtmlInput(html: string): string {
  const t = html.trim();
  if (!t.startsWith("[")) return html;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      return html;
    }
    const screens = parsed as string[];
    if (screens.length === 0) return "<div></div>";
    const inner = screens
      .map(
        (s, i) =>
          `<section class="flex flex-col w-full" data-screen-index="${i}">${s}</section>`
      )
      .join("");
    return `<div class="flex flex-col gap-0 w-full">${inner}</div>`;
  } catch {
    return html;
  }
}

function parseInlineStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function mapNode(el: HE | TN): ParsedNode | null {
  if (el.nodeType === 3) {
    const raw = (el as TN).rawText ?? "";
    if (!raw.trim()) return null;
    return {
      tagName: "#text",
      attributes: {},
      classList: [],
      inlineStyles: {},
      textContent: raw,
      children: [],
      isTextNode: true,
    };
  }

  const h = el as HE;
  const tag = (h.tagName || "div").toLowerCase();
  if (tag === "script" || tag === "style") return null;

  const classAttr = h.getAttribute("class") ?? h.getAttribute("className") ?? "";
  const classList = classAttr.split(/\s+/).filter(Boolean);
  const styleAttr = h.getAttribute("style") ?? "";
  const inlineStyles = styleAttr ? parseInlineStyle(styleAttr) : {};

  const childNodes: ParsedNode[] = [];
  for (const c of h.childNodes) {
    const mapped = mapNode(c as HE | TN);
    if (mapped) childNodes.push(mapped);
  }

  const textFromChildren = childNodes
    .filter((c) => c.isTextNode)
    .map((c) => c.textContent ?? "")
    .join("")
    .trim();
  const structChildren = childNodes.filter((c) => !c.isTextNode);

  const attrs = { ...(h.attributes as Record<string, string>) };

  return {
    tagName: tag,
    attributes: attrs,
    classList,
    inlineStyles,
    textContent: textFromChildren || null,
    children: structChildren,
    isTextNode: false,
  };
}

export function parseHtmlToTree(html: string): ParsedNode | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  const root = parse(trimmed, { comment: false });
  const body = root.querySelector("body");
  const container = body ?? root;
  const children = container.childNodes
    .map((c) => mapNode(c as HE | TN))
    .filter((x): x is ParsedNode => !!x);

  if (children.length === 1) return children[0]!;
  return {
    tagName: "div",
    attributes: {},
    classList: [],
    inlineStyles: {},
    textContent: null,
    children,
    isTextNode: false,
  };
}
