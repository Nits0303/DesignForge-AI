export function sanitizeHtmlForIframe(html: string) {
  let out = html;
  // Strip scripts, but preserve trusted runtime scripts needed for preview rendering:
  // - DesignForge postMessage helper (`__designforge`)
  // - Tailwind CDN script injected by post-processing for utility-class outputs.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, (m) => {
    const lower = m.toLowerCase();
    if (m.includes("__designforge")) return m;
    if (lower.includes("https://cdn.tailwindcss.com")) return m;
    return "";
  });
  // Remove javascript: links.
  out = out.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
  // Remove nested iframe srcdoc.
  out = out.replace(/\s+srcdoc\s*=\s*["'][\s\S]*?["']/gi, "");
  // Remove external form actions.
  out = out.replace(
    /action\s*=\s*["']https?:\/\/[^"']*["']/gi,
    'action="#"'
  );
  return out;
}

