/**
 * Sprint 17 — automated checks before a template enters human review.
 */

const DISALLOWED_SCRIPT = /<script[\s\S]*?<\/script>/i;
const ON_EVENT_HANDLER = /\bon\w+\s*=/i;

export type ContributionAutoResult =
  | { ok: true; flags: { externalImages: boolean } }
  | { ok: false; reason: string };

export function runContributionAutoChecks(html: string): ContributionAutoResult {
  const h = html ?? "";
  if (DISALLOWED_SCRIPT.test(h)) {
    return {
      ok: false,
      reason:
        "Your template contains code that is not permitted. Remove all <script> tags and inline scripts.",
    };
  }
  if (ON_EVENT_HANDLER.test(h)) {
    return {
      ok: false,
      reason:
        "Your template contains event handlers (onclick=, etc.) which are not permitted. Use Tailwind and semantic HTML only.",
    };
  }

  const linkTags = h.match(/<link[^>]+>/gi) ?? [];
  for (const tag of linkTags) {
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch?.[1] ?? "";
    if (!href) continue;
    if (/tailwindcss|googleapis|gstatic|fonts\.google/i.test(href)) continue;
    return {
      ok: false,
      reason:
        "Your template contains resource links that are not permitted. Only Tailwind CDN and Google Fonts are allowed in <link> tags.",
    };
  }

  let externalImages = false;
  const imgTags = h.match(/<img[^>]+>/gi) ?? [];
  for (const tag of imgTags) {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    const src = srcMatch?.[1] ?? "";
    if (!src) continue;
    if (tag.includes('data-placeholder="true"')) continue;
    if (/^https?:\/\//i.test(src) && !/tailwind|googleapis|gstatic/i.test(src)) {
      externalImages = true;
    }
  }

  return { ok: true, flags: { externalImages } };
}
