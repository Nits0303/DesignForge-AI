export type Platform =
  | "instagram"
  | "linkedin"
  | "facebook"
  | "twitter"
  | "website"
  | "mobile"
  | "dashboard";

export type DesignFormat =
  | "post"
  | "story"
  | "banner"
  | "feed"
  | "landing"
  | "screen";

export type DesignStatus =
  | "generating"
  | "preview"
  | "approved"
  | "exported"
  | "archived";

export type ExportFormat =
  | "png"
  | "jpg"
  | "pdf"
  | "figma_bridge"
  | "figma_plugin"
  | "html_css"
  | "zip";

export type ParsedIntent = {
  objective?: string;
  tone?: string;
  audience?: string;
  references?: string[];
};

export type Design = {
  id: string;
  title: string;
  originalPrompt: string;
  platform: Platform;
  format: DesignFormat;
  status: DesignStatus;
  parsedIntent?: ParsedIntent;
};

export type DesignVersion = {
  id: string;
  designId: string;
  versionNumber: number;
  htmlContent: string;
};

export type DesignAsset = {
  id: string;
  designId: string;
  versionNumber: number;
  assetType: string;
  fileUrl: string;
};

