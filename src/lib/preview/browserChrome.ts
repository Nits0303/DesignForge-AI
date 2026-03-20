export function wrapWithDashboardBrowserChrome(innerBodyHtml: string): string {
  // Static chrome mockup for dashboard exports.
  // Keep it simple so Puppeteer screenshots and PDFs look consistent.
  return `
  <div style="width:100%; height:100%; background:#fff; font-family: inherit;">
    <div style="height:34px; display:flex; align-items:center; gap:10px; padding:0 12px; background:#2a2a2a; color:#888;">
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="width:10px; height:10px; border-radius:50%; background:#ff5f57; display:inline-block;"></span>
        <span style="width:10px; height:10px; border-radius:50%; background:#febc2e; display:inline-block;"></span>
        <span style="width:10px; height:10px; border-radius:50%; background:#28c840; display:inline-block;"></span>
      </div>
      <div style="flex:1; height:22px; border-radius:6px; background:#3a3a3a; display:flex; align-items:center; padding:0 10px; font-size:12px;">
        dashboard.example.com
      </div>
    </div>
    <div>${innerBodyHtml}</div>
  </div>
  `.trim();
}

