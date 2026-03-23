/**
 * Parse DesignVersion.htmlContent for mobile multi-screen flows (JSON string array).
 */
export function parseMobileScreens(htmlContent: string): string[] | null {
  const t = htmlContent.trim();
  if (!t.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x) => typeof x === "string") as string[];
  } catch {
    return null;
  }
}
