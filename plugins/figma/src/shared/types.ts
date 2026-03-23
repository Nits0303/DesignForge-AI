export type ParsedNode = {
  tagName: string;
  attributes: Record<string, string>;
  classList: string[];
  inlineStyles: Record<string, string>;
  textContent: string | null;
  children: ParsedNode[];
  isTextNode: boolean;
};

export type ResolvedStyles = Record<string, unknown>;

export type TranslationReport = {
  layerCount: number;
  layersByType: { frame: number; text: number; image: number; rectangle: number };
  fontsLoaded: string[];
  fontSubstitutions: { original: string; substituted: string }[];
  imagesLoaded: number;
  imagesFailed: number;
  unsupportedClasses: string[];
  translationTimeMs: number;
};

export const PLUGIN_VERSION = "1.0.0";
