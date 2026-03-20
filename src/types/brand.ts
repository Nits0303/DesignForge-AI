export type BrandColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
};

export type BrandTypography = {
  headingFont: string;
  bodyFont: string;
  headingWeight: 700 | 600 | 500;
  bodyWeight: 400 | 500;
};

export type BrandProfile = {
  id: string;
  name: string;
  toneVoice?: string;
  industry?: string;
  logoPrimaryUrl?: string | null;
  logoIconUrl?: string | null;
  logoDarkUrl?: string | null;
  colors?: BrandColors;
  typography?: BrandTypography;
  isDefault: boolean;
};

export type BrandAsset = {
  id: string;
  brandId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  category: "logo" | "product" | "team" | "background" | "other";
};

