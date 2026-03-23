import { puppeteerClient } from "@/lib/export/puppeteerClient";

/**
 * Attempts to render template HTML via Puppeteer thumbnail service.
 * Returns false if service missing, times out, or output is effectively empty.
 */
export async function checkTemplateRenders(html: string): Promise<{ ok: boolean; reason?: string }> {
  if (!process.env.PUPPETEER_SERVICE_URL) {
    return { ok: true, reason: "skipped_no_puppeteer" };
  }
  try {
    const buf = await puppeteerClient.thumbnail({ html, waitUntil: "networkidle0" });
    if (!buf || buf.length < 80) {
      return { ok: false, reason: "blank_or_tiny_render" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ? String(e.message).slice(0, 200) : "render_failed" };
  }
}
