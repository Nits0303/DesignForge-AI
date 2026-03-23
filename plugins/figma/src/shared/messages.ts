import type { TranslationReport } from "./types";

export type UiToPlugin =
  | { type: "PUSH_DESIGN"; designId: string; versionNumber: number; html: string }
  | { type: "CANCEL_PUSH" }
  | { type: "CLEAR_TOKEN" }
  | { type: "OPEN_URL"; url: string };

export type PluginToUi =
  | { type: "TOKEN_STATUS"; hasToken: boolean }
  | { type: "PUSH_PROGRESS"; step: string; percentComplete: number }
  | { type: "PUSH_COMPLETE"; layerCount: number; nodeId: string; report: TranslationReport }
  | { type: "PUSH_ERROR"; error: string };
