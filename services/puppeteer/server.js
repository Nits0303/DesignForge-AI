const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-core");

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const chromiumExecutablePath =
  process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";

const renderQueue = [];
let activePages = 0;
const MAX_CONCURRENT_PAGES = 3;

let browserPromise = null;
async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = puppeteer.launch({
    executablePath: chromiumExecutablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return browserPromise;
}

function dequeue() {
  if (activePages >= MAX_CONCURRENT_PAGES) return;
  const next = renderQueue.shift();
  if (!next) return;
  activePages += 1;
  next()
    .catch(() => {})
    .finally(() => {
      activePages -= 1;
      dequeue();
    });
}

async function withQueuedRender(fn) {
  return new Promise((resolve, reject) => {
    renderQueue.push(() => fn().then(resolve).catch(reject));
    dequeue();
  });
}

function safeError(err) {
  const msg = err?.message ? String(err.message) : "Unknown rendering error";
  const isPermanent =
    /invalid html|syntax|crash|page crashed/i.test(msg) ||
    err?.name === "PageError";
  return { error: msg, retryable: !isPermanent };
}

async function ensureHeight(page, height) {
  if (height !== "auto") return;
  // If height is auto, set viewport height to body scrollHeight.
  const scrollHeight = await page.evaluate(() => {
    const body = document.body;
    return Math.max(
      body ? body.scrollHeight || body.offsetHeight || 0 : 0,
      document.documentElement?.scrollHeight || 0
    );
  });
  if (scrollHeight > 0) {
    await page.setViewport({ width: await page.viewport().width, height: scrollHeight });
  }
}

app.get("/health", async (_req, res) => {
  try {
    const browser = await getBrowser();
    const version = await browser.version();
    res.json({
      status: "ok",
      chromiumVersion: version,
      queueLength: renderQueue.length,
      activePages,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: safeError(err) });
  }
});

async function renderScreenshot({ html, width, height, format, quality, waitUntil, scale }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const waitOpt = waitUntil === "networkidle2" ? "networkidle2" : "networkidle0";
    const initialHeight = height === "auto" ? 800 : Number(height);
    await page.setViewport({
      width: Number(width),
      height: initialHeight || 800,
      deviceScaleFactor: scale || 2,
    });

    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: waitOpt });

    if (height === "auto") {
      await ensureHeight(page, "auto");
      // Give layout a tiny moment to settle.
      await page.waitForTimeout(100);
    } else {
      // Small delay to let animations/fonts settle for deterministic snapshots.
      await page.waitForTimeout(120);
    }

    if (format === "jpg") {
      const buf = await page.screenshot({
        type: "jpeg",
        quality: Math.max(80, Math.min(100, quality || 90)),
      });
      return buf;
    }

    const buf = await page.screenshot({ type: "png" });
    return buf;
  } finally {
    await page.close().catch(() => {});
  }
}

function isBlockedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === "file:" || u.protocol === "data:") return true;
    const host = (u.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.startsWith("10.")) return true;
    if (host.startsWith("192.168.")) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

function shouldBlockRequestUrl(raw) {
  try {
    const u = new URL(raw);
    const protocol = (u.protocol || "").toLowerCase();
    if (["file:", "data:", "blob:", "chrome:", "chrome-extension:"].includes(protocol)) return true;
    const host = (u.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.startsWith("10.")) return true;
    if (host.startsWith("192.168.")) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

async function renderScreenshotFromUrl({ url, width, fullPage, waitUntil }) {
  if (isBlockedUrl(url)) {
    const err = new Error("Blocked URL");
    err.code = "URL_BLOCKED";
    throw err;
  }
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const waitOpt = waitUntil === "networkidle0" ? "networkidle0" : "networkidle2";
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const reqUrl = req.url();
      if (shouldBlockRequestUrl(reqUrl)) {
        req.abort("blockedbyclient").catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
    await page.setViewport({
      width: Number(width) || 1440,
      height: 900,
      deviceScaleFactor: 1,
    });
    await page.goto(url, { waitUntil: waitOpt, timeout: 15_000 });
    await page.waitForTimeout(180);
    const buf = await page.screenshot({ type: "png", fullPage: !!fullPage });
    return buf;
  } finally {
    await page.close().catch(() => {});
  }
}

async function renderPDF({ html, width, height, pageFormat, landscape, margin, waitUntil }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const waitOpt = waitUntil === "networkidle2" ? "networkidle2" : "networkidle0";
    const pdfFormat = pageFormat || "A4";
    const landscapeBool = !!landscape;

    await page.setViewport({
      width: Number(width),
      height: height === "auto" ? 900 : Number(height) || 900,
      deviceScaleFactor: 2,
    });

    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: waitOpt });
    await page.waitForTimeout(120);

    if (height === "auto") {
      await ensureHeight(page, "auto");
    }

    const pdfBuf = await page.pdf({
      format: pdfFormat,
      landscape: landscapeBool,
      margin: margin || { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      printBackground: true,
    });
    return pdfBuf;
  } finally {
    await page.close().catch(() => {});
  }
}

app.post("/render/screenshot", async (req, res) => {
  const task = async () => {
    const {
      html,
      width,
      height,
      format,
      quality,
      waitUntil = "networkidle0",
      scale = 2,
    } = req.body || {};

    if (!html || !width) {
      res.status(400).json({ error: "Missing html/width", retryable: false });
      return;
    }

    const buf = await renderScreenshot({
      html: String(html),
      width: Number(width),
      height: height === "auto" ? "auto" : Number(height),
      format: String(format || "png"),
      quality: Number(quality || 90),
      waitUntil,
      scale: Number(scale || 2),
    });

    res.setHeader("Content-Type", format === "jpg" ? "image/jpeg" : "image/png");
    res.send(buf);
  };

  await withQueuedRender(task).catch((err) => {
    const { error, retryable } = safeError(err);
    res.status(500).json({ error, retryable });
  });
});

app.post("/render/pdf", async (req, res) => {
  const task = async () => {
    const {
      html,
      width,
      height,
      pageFormat = "A4",
      landscape = false,
      margin,
      waitUntil = "networkidle0",
    } = req.body || {};

    if (!html || !width) {
      res.status(400).json({ error: "Missing html/width", retryable: false });
      return;
    }

    const buf = await renderPDF({
      html: String(html),
      width: Number(width),
      height,
      pageFormat,
      landscape,
      margin,
      waitUntil,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.send(buf);
  };

  await withQueuedRender(task).catch((err) => {
    const { error, retryable } = safeError(err);
    res.status(500).json({ error, retryable });
  });
});

app.post("/render/thumbnail", async (req, res) => {
  const task = async () => {
    const { html, waitUntil = "networkidle0" } = req.body || {};
    if (!html) {
      res.status(400).json({ error: "Missing html", retryable: false });
      return;
    }
    const buf = await renderScreenshot({
      html: String(html),
      width: 600,
      height: 400,
      format: "png",
      quality: 90,
      waitUntil,
      scale: 1,
    });
    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  };

  await withQueuedRender(task).catch((err) => {
    const { error, retryable } = safeError(err);
    res.status(500).json({ error, retryable });
  });
});

app.post("/render/screenshot-url", async (req, res) => {
  const task = async () => {
    const { url, width = 1440, fullPage = true, waitUntil = "networkidle2" } = req.body || {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing url", retryable: false });
      return;
    }
    try {
      const buf = await renderScreenshotFromUrl({ url, width, fullPage, waitUntil });
      res.setHeader("Content-Type", "image/png");
      res.status(200).send(buf);
    } catch (err) {
      const safe = safeError(err);
      if (err?.code === "URL_BLOCKED") {
        res.status(400).json({ error: "Blocked URL", code: "URL_BLOCKED", retryable: false });
        return;
      }
      res.status(500).json(safe);
    }
  };
  withQueuedRender(task).catch((err) => {
    const safe = safeError(err);
    res.status(500).json(safe);
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[puppeteer-service] listening on ${PORT}`);
});

