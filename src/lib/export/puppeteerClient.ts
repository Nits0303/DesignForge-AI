export type PuppeteerServiceHealth = {
  status: "ok" | string;
  chromiumVersion?: string;
  queueLength?: number;
  activePages?: number;
};

export type PuppeteerError = Error & {
  code?: string;
  retryable?: boolean;
};

type ScreenshotParams = {
  html: string;
  width: number;
  height: number | "auto";
  format: "png" | "jpg";
  quality?: number;
  waitUntil?: "networkidle0" | "networkidle2";
  scale?: number;
};

type UrlScreenshotParams = {
  url: string;
  width?: number;
  fullPage?: boolean;
  waitUntil?: "networkidle0" | "networkidle2";
};

type PdfParams = {
  html: string;
  width: number;
  height: number | "auto";
  pageFormat?: "A4" | "A3" | "Letter";
  landscape?: boolean;
  margin?: { top: string; right: string; bottom: string; left: string };
  waitUntil?: "networkidle0" | "networkidle2";
};

type ThumbnailParams = {
  html: string;
  waitUntil?: "networkidle0" | "networkidle2";
};

function getBaseUrl() {
  const base = process.env.PUPPETEER_SERVICE_URL;
  if (!base) {
    throw Object.assign(new Error("Missing PUPPETEER_SERVICE_URL"), { code: "PUPPETEER_CONFIG" });
  }
  return base.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs: number }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    if (isTimeout) {
      const e = new Error(`Puppeteer request timed out: ${url}`) as PuppeteerError;
      e.code = "PUPPETEER_TIMEOUT";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function coerceWaitUntil(v?: string) {
  if (v === "networkidle2") return "networkidle2";
  return "networkidle0";
}

async function parseServiceError(res: Response): Promise<PuppeteerError> {
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  const e = new Error(json?.error || `Puppeteer request failed: ${res.status}`) as PuppeteerError;
  e.code = json?.code || "PUPPETEER_RENDER_FAILED";
  e.retryable = typeof json?.retryable === "boolean" ? json.retryable : false;
  return e;
}

export const puppeteerClient = {
  async checkHealth(): Promise<boolean> {
    const url = `${getBaseUrl()}/health`;
    const res = await fetchWithTimeout(url, { method: "GET", timeoutMs: 3000 });
    if (!res.ok) return false;
    const json = (await res.json()) as PuppeteerServiceHealth;
    return json?.status === "ok";
  },

  async screenshot(params: ScreenshotParams): Promise<Buffer> {
    const url = `${getBaseUrl()}/render/screenshot`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      timeoutMs: 30_000,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        waitUntil: coerceWaitUntil(params.waitUntil),
        scale: params.scale ?? 2,
      }),
    });
    if (!res.ok) throw await parseServiceError(res);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  },

  async screenshotUrl(params: UrlScreenshotParams): Promise<Buffer> {
    const url = `${getBaseUrl()}/render/screenshot-url`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      timeoutMs: 30_000,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        waitUntil: coerceWaitUntil(params.waitUntil),
      }),
    });
    if (!res.ok) throw await parseServiceError(res);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  },

  async pdf(params: PdfParams): Promise<Buffer> {
    const url = `${getBaseUrl()}/render/pdf`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      timeoutMs: 60_000,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        waitUntil: coerceWaitUntil(params.waitUntil),
      }),
    });
    if (!res.ok) throw await parseServiceError(res);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  },

  async thumbnail(params: ThumbnailParams): Promise<Buffer> {
    const url = `${getBaseUrl()}/render/thumbnail`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      timeoutMs: 10_000,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        waitUntil: coerceWaitUntil(params.waitUntil),
      }),
    });
    if (!res.ok) throw await parseServiceError(res);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  },
};

