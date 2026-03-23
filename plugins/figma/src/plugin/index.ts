/// <reference types="@figma/plugin-typings" />

import { normalizeHtmlInput, parseHtmlToTree } from "./translator/htmlParser";
import { translateTree } from "./translator/nodeCreator";
import type { TranslationReport } from "../shared/types";

declare const __html__: string;

figma.showUI(__html__, { width: 320, height: 640, themeColors: true });

type UiMsg = {
  type: string;
  html?: string;
  designId?: string;
  versionNumber?: number;
  token?: string;
  settingsUrl?: string;
  /** Origin for resolving relative <img src> (e.g. https://app.example.com) */
  apiBase?: string;
};

function postToUi(payload: Record<string, unknown>) {
  figma.ui.postMessage(payload);
}

figma.ui.onmessage = async (msg: UiMsg) => {
  if (msg?.type === "LOAD_TOKEN") {
    const token = (await figma.clientStorage.getAsync("designforge_token")) as string | undefined;
    postToUi({ type: "TOKEN_FROM_MAIN", token: token ?? "" });
    return;
  }

  if (msg?.type === "SAVE_TOKEN" && typeof msg.token === "string") {
    await figma.clientStorage.setAsync("designforge_token", msg.token);
    return;
  }

  if (msg?.type === "CLEAR_TOKEN") {
    await figma.clientStorage.setAsync("designforge_token", "");
    return;
  }

  if (msg?.type === "OPEN_SETTINGS" && msg.settingsUrl) {
    figma.openExternal(msg.settingsUrl);
    return;
  }

  if (msg?.type === "PUSH_DESIGN" && typeof msg.html === "string") {
    const designId = typeof msg.designId === "string" ? msg.designId : "";
    const versionNumber = typeof msg.versionNumber === "number" ? msg.versionNumber : 1;

    let top: FrameNode | null = null;
    try {
      postToUi({ type: "PUSH_PROGRESS", step: "Parsing HTML...", percentComplete: 20 });
      const normalized = normalizeHtmlInput(msg.html);
      const tree = parseHtmlToTree(normalized);

      postToUi({ type: "PUSH_PROGRESS", step: "Creating frames...", percentComplete: 55 });
      const apiBase = typeof msg.apiBase === "string" ? msg.apiBase.trim() : "";
      const { frame, report } = await translateTree(tree, { assetsBaseUrl: apiBase || undefined });
      top = frame;

      figma.currentPage.appendChild(frame);
      const jitter = 20 + Math.floor(Math.random() * 31);
      frame.x = figma.viewport.center.x - frame.width / 2 + jitter;
      frame.y = figma.viewport.center.y - frame.height / 2 + jitter;

      postToUi({ type: "PUSH_PROGRESS", step: "Done!", percentComplete: 100 });
      const figmaFileKey = figma.fileKey ?? "";
      postToUi({
        type: "PUSH_COMPLETE",
        designId,
        versionNumber,
        figmaFileKey,
        layerCount: report.layerCount,
        nodeId: frame.id,
        report,
      } satisfies {
        type: "PUSH_COMPLETE";
        designId: string;
        versionNumber: number;
        figmaFileKey: string;
        layerCount: number;
        nodeId: string;
        report: TranslationReport;
      });
      figma.viewport.scrollAndZoomIntoView([frame]);
    } catch (e: any) {
      if (top) {
        try {
          top.remove();
        } catch {
          /* noop */
        }
      }
      postToUi({ type: "PUSH_ERROR", error: e?.message ?? String(e) });
    }
  }
};
