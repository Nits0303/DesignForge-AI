import type { BrandProfile } from "@/types/brand";

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `  <${name}>${escapeXml(v)}</${name}>\n`;
}

export function brandProfileToXml(brand: BrandProfile) {
  const colors = (brand.colors ?? {}) as any;
  const typography = (brand.typography ?? {}) as any;

  const lines: string[] = [];
  lines.push("<brand_profile>\n");
  lines.push(tag("name", brand.name));

  const primary = colors.primary?.trim();
  const secondary = colors.secondary?.trim();
  const accent = colors.accent?.trim();
  const background = colors.background?.trim();
  const text = colors.text?.trim();

  if (primary || secondary || accent || background || text) {
    lines.push("  <colors>\n");
    if (primary) lines.push(`    <primary>${escapeXml(primary)}</primary>\n`);
    if (secondary) lines.push(`    <secondary>${escapeXml(secondary)}</secondary>\n`);
    if (accent) lines.push(`    <accent>${escapeXml(accent)}</accent>\n`);
    if (background) lines.push(`    <background>${escapeXml(background)}</background>\n`);
    if (text) lines.push(`    <text>${escapeXml(text)}</text>\n`);
    lines.push("  </colors>\n");
  }

  const headingFont = typography.headingFont?.trim();
  const bodyFont = typography.bodyFont?.trim();
  const headingWeight = typography.headingWeight;
  const bodyWeight = typography.bodyWeight;
  if (headingFont || bodyFont) {
    const t = `heading: ${headingFont ?? "—"} ${headingWeight ?? ""} | body: ${bodyFont ?? "—"} ${bodyWeight ?? ""}`.trim();
    lines.push(tag("typography", t));
  }

  lines.push(tag("tone", brand.toneVoice));
  lines.push(tag("industry", brand.industry));

  const logo = brand.logoPrimaryUrl ?? undefined;
  if (logo) {
    lines.push(tag("logo_url", logo));
  }

  lines.push("</brand_profile>");
  return lines.join("");
}

