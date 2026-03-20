export function sanitizeHtmlForIframe(html: string) {
  let out = html;
  // Strip scripts, but preserve our own inline DesignForge postMessage helpers.
  // These are injected during server-side post-processing and include the `__designforge` marker.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, (m) => {
    if (m.includes("__designforge")) return m;
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

