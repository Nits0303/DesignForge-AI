'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Tablet, Smartphone, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { sanitizeHtmlForIframe } from "@/lib/ai/htmlSanitizer.client";
import { useDesignGeneration } from "@/hooks/useDesignGeneration";
import { parseSlidesFromHtml } from "@/lib/preview/slideParser";
import { parseMobileScreens } from "@/lib/mobile/parseMobileVersionHtml";
import { PreviewErrorBoundary } from "@/components/workspace/PreviewErrorBoundary";
import { WorkspacePreviewToolbar } from "@/components/workspace/WorkspacePreviewToolbar";
import { PLATFORM_SPECS } from "@/constants/platforms";
import type { Platform } from "@/types/design";
import { DEFAULT_SOCIAL_DIMENSION } from "@/constants/platforms";
import {
  MOBILE_DEVICE_PRESETS,
  applyOrientation,
  getMobileDevicePreset,
  type MobileDeviceId,
} from "@/constants/mobileDevices";
import { IosFrame } from "@/components/workspace/PhoneFrames/IosFrame";
import { AndroidFrame } from "@/components/workspace/PhoneFrames/AndroidFrame";
import { TabletFrame } from "@/components/workspace/PhoneFrames/TabletFrame";
import { MobileStatusBar } from "@/components/workspace/PhoneFrames/MobileStatusBar";

type SlideMode = "single" | "carousel" | "multi-screen";

const SOCIAL_PLATFORMS = new Set(["instagram", "linkedin", "facebook", "twitter"]);

function injectBaseHrefIntoHead(html: string, baseHref: string): string {
  const href = String(baseHref ?? "").trim();
  if (!href) return html;
  if (/<base\s+href=/i.test(html)) return html;
  // Insert <base> as the first element in <head>.
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><base href="${href}">`);
  }
  return html;
}

function injectIframeResetAndRoot(
  html: string,
  viewportWidthPx?: number,
  forceShrinkToFit = false,
  baseHref?: string,
  fixedCanvas = false
): string {
  const responsiveViewportCss =
    viewportWidthPx && viewportWidthPx > 0
      ? `@media (max-width:${viewportWidthPx}px){html,body,#design-root{overflow-x:hidden!important;max-width:100%!important;}}`
      : "";
  const shrinkToFitScript = forceShrinkToFit
    ? `<script data-designforge-shrink-fit="1">
(function(){
  function fit(){
    try {
      var root = document.getElementById("design-root");
      if (!root) return;
      root.style.transform = "";
      root.style.transformOrigin = "top left";
      root.style.width = "100%";
      root.style.height = "auto";
      var docEl = document.documentElement;
      var sw = Math.max(
        docEl ? docEl.scrollWidth : 0,
        document.body ? document.body.scrollWidth : 0,
        root.scrollWidth || 0
      );
      var vw = Math.max(window.innerWidth || 0, docEl ? docEl.clientWidth : 0, 1);
      var scale = sw > vw ? (vw / sw) : 1;
      if (scale < 1) {
        root.style.width = sw + "px";
        root.style.transform = "scale(" + scale + ")";
      }
      var rectH = root.getBoundingClientRect ? root.getBoundingClientRect().height : 0;
      var sh = Math.max(
        rectH || 0,
        root.scrollHeight || 0,
        document.body ? document.body.scrollHeight : 0,
        docEl ? docEl.scrollHeight : 0
      );
      var height = Math.ceil(sh);
      try { window.parent.postMessage({ __designforge: "auto_height", height: height }, "*"); } catch(_) {}
    } catch(_) {}
  }
  window.addEventListener("load", fit);
  window.addEventListener("resize", fit);
  setTimeout(fit, 0);
  setTimeout(fit, 150);
  setTimeout(fit, 500);
})();
</script>`
    : "";
  const resetCss = `<style data-designforge-preview-reset="1">
html, body { margin: 0; padding: 0; background: transparent; }
${fixedCanvas ? "html, body { width: 100%; height: 100%; }" : ""}
body { overflow: ${fixedCanvas ? "hidden" : "visible"}; }
#design-root { margin: 0; padding: 0; display: block; width: 100%; ${
    fixedCanvas ? "height: 100%; min-height: 100%; position: relative; overflow: hidden;" : "height: auto; min-height: 0;"
  } }
${responsiveViewportCss}
</style>`;
  const suppressTailwindCdnWarning = `<script data-designforge-tailwind-warn-filter="1">
(function(){
  try {
    var pat = /cdn\\.tailwindcss\\.com should not be used in production/i;
    var ow = console.warn ? console.warn.bind(console) : null;
    if (ow) {
      console.warn = function() {
        try {
          var msg = arguments && arguments[0] != null ? String(arguments[0]) : "";
          if (pat.test(msg)) return;
        } catch(_) {}
        return ow.apply(console, arguments);
      };
    }
  } catch(_) {}
})();
</script>`;

  const source = html && html.trim().length ? html : "<div></div>";

  // Full document: inject into <head> and wrap body contents once.
  if (/<html[\s>]/i.test(source) && /<body[\s>]/i.test(source)) {
    let out = source;
    out = injectBaseHrefIntoHead(out, String(baseHref ?? ""));
    if (!/data-designforge-preview-reset="1"/i.test(out)) {
      if (/<head[^>]*>/i.test(out)) {
        out = out.replace(/<head([^>]*)>/i, `<head$1>${resetCss}${suppressTailwindCdnWarning}${shrinkToFitScript}`);
      } else {
        out = out.replace(
          /<html([^>]*)>/i,
          `<html$1><head>${resetCss}${suppressTailwindCdnWarning}${shrinkToFitScript}</head>`
        );
      }
    }
    if (!/id="design-root"/i.test(out)) {
      out = out.replace(/<body([^>]*)>([\s\S]*?)<\/body>/i, `<body$1><div id="design-root">$2</div></body>`);
    }
    return out;
  }

  // Fragment: create a complete srcdoc shell.
  const baseTag = baseHref ? `<base href="${String(baseHref).trim()}">` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${baseTag}${resetCss}${suppressTailwindCdnWarning}${shrinkToFitScript}</head><body><div id="design-root">${source}</div></body></html>`;
}

export function WorkspacePreviewPanel({
  layout = "desktop",
}: {
  /** Second instance is mounted for mobile layout; ids must not collide. */
  layout?: "desktop" | "mobile";
}) {
  const idSuf = layout === "mobile" ? "-mobile" : "";
  const { startGeneration } = useDesignGeneration();
  const {
    previewHtml,
    generationState,
    generationError,
    statusMessage,
    zoomLevel,
    setZoomLevel,
    previewMode,
    setPreviewMode,
    breakpoint,
    setBreakpoint,
    lastGenerationMeta,
    versionFlashNonce,
    lastPrompt,
    activeBrandProfileId,
    referenceImageUrl,
    activeSlide,
    setActiveSlide,
    hoveredSectionType,
    scrollToSectionType,
    setScrollToSectionType,
    activeDeviceId,
    setActiveDeviceId,
    deviceOrientation,
    setDeviceOrientation,
    selectedDimension,
  } = useWorkspaceStore((s) => s);

  const [flashBorder, setFlashBorder] = useState(false);
  const [slides, setSlides] = useState<string[]>([]);
  const [slideMode, setSlideMode] = useState<SlideMode>("single");
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const mainIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [responsiveMode, setResponsiveMode] = useState(false);
  const [autoHeightPx, setAutoHeightPx] = useState<number | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusScale, setFocusScale] = useState(1);

  const mobilePreset = useMemo(() => getMobileDevicePreset(activeDeviceId), [activeDeviceId]);
  const orientedDevice = useMemo(
    () => applyOrientation(mobilePreset, deviceOrientation),
    [mobilePreset, deviceOrientation]
  );

  useEffect(() => {
    if (!versionFlashNonce) return;
    setFlashBorder(true);
    const timer = window.setTimeout(() => setFlashBorder(false), 400);
    return () => window.clearTimeout(timer);
  }, [versionFlashNonce]);

  useEffect(() => {
    const html = previewHtml || "";
    if (!html.trim()) {
      setSlides([]);
      setSlideMode("single");
      setActiveSlide(0);
      setAutoHeightPx(null);
      return;
    }
    if (isWebOrDash) setAutoHeightPx(null);
    try {
      // Sprint 14 mobile flows: version html is JSON.stringify(string[])
      if (html.trim().startsWith("[")) {
        const mobileScreens = parseMobileScreens(html);
        if (mobileScreens && mobileScreens.length > 0) {
          setSlides(mobileScreens);
          setSlideMode("multi-screen");
          setActiveSlide(Math.min(activeSlide, mobileScreens.length - 1));
          return;
        }
      }
      const parsed = parseSlidesFromHtml(html);
      setSlides(parsed.slides);
      setSlideMode(parsed.type);
      setActiveSlide(Math.min(activeSlide, parsed.slides.length - 1));
    } catch {
      setSlides([html]);
      setSlideMode("single");
      setActiveSlide(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewHtml]);

  const platform = (lastGenerationMeta?.platform ?? "") as Platform;
  const format = lastGenerationMeta?.format ?? "post";
  const isSocial = SOCIAL_PLATFORMS.has(platform);
  const isWebOrDash = platform === "website" || platform === "dashboard";
  const isMobile = platform === "mobile";

  // Website preview should open as a single desktop canvas.
  useEffect(() => {
    if (platform === "website") {
      setResponsiveMode(false);
      setBreakpoint("desktop");
    }
  }, [platform, setBreakpoint]);

  const dimensions = useMemo(() => {
    if (isMobile) {
      return { width: orientedDevice.width, height: orientedDevice.height };
    }
    // Social canvas size is driven by Dimension Selector (even before generation).
    if (isSocial) {
      const d = selectedDimension ?? DEFAULT_SOCIAL_DIMENSION;
      return { width: d.width, height: d.height };
    }
    const d = lastGenerationMeta?.dimensions;
    if (!d) return { width: 1080, height: 1080 };
    if (typeof (d as any).height === "string" && (d as any).height === "auto") {
      return { width: (d as any).width ?? 1080, height: 900 };
    }
    return d as any;
  }, [isMobile, orientedDevice.height, orientedDevice.width, isSocial, selectedDimension, lastGenerationMeta?.dimensions]);

  const iframeWidth = isMobile
    ? orientedDevice.width
    : breakpoint === "desktop"
      ? dimensions.width
      : breakpoint === "tablet"
        ? 768
        : 375;
  const iframeHeight = isMobile ? orientedDevice.height : dimensions.height;
  const displayedIframeHeight = isWebOrDash ? autoHeightPx ?? iframeHeight : iframeHeight;

  const isLoading =
    generationState === "connecting" ||
    generationState === "generating" ||
    generationState === "processing_images";

  const effectiveHtml =
    slides.length > 0 ? slides[Math.min(activeSlide, slides.length - 1)] ?? slides[0] : previewHtml;
  const showSlidesControls = slides.length > 1;

  /** Phone frames add bezel — include in “fit” math so the artboard doesn’t clip. */
  const fitBoxW =
    isMobile ?
      iframeWidth + (mobilePreset.os === "tablet" ? 52 : mobilePreset.os === "android" ? 26 : 30)
    : iframeWidth;
  const fitBoxH =
    isMobile ?
      iframeHeight + (mobilePreset.os === "tablet" ? 52 : mobilePreset.os === "android" ? 32 : 38)
    : displayedIframeHeight;

  useEffect(() => {
    const el = artboardRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const padding = 0;
      const availableW = Math.max(rect.width - padding, 1);
      const availableH = Math.max(rect.height - padding, 1);
      const baseScale = Math.min(availableW / fitBoxW, availableH / fitBoxH, 1);
      setFitScale(baseScale);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitBoxW, fitBoxH]);

  // Listen for auto-height messages from website/dashboard renders inside the iframe.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data as any;
      if (!data || data.__designforge !== "auto_height") return;
      if (!isWebOrDash) return;
      const h = Number(data.height);
      if (!Number.isFinite(h) || h <= 0) return;
      setAutoHeightPx(h);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isWebOrDash]);

  useEffect(() => {
    if (!isFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFocusMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFocusMode]);

  useEffect(() => {
    if (!isFocusMode) setFocusScale(1);
  }, [isFocusMode]);

  useEffect(() => {
    if (!isFocusMode) return;
    const el = artboardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFocusScale((prev) => {
        const next = prev - e.deltaY * 0.01;
        return Math.min(4, Math.max(0.25, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, [isFocusMode]);

  // Send highlight messages into iframe based on chat hover.
  useEffect(() => {
    if (!isWebOrDash) return;
    if (!mainIframeRef.current?.contentWindow) return;
    mainIframeRef.current.contentWindow.postMessage(
      { __designforge_highlight: hoveredSectionType ? hoveredSectionType : null },
      "*"
    );
  }, [hoveredSectionType, isWebOrDash]);

  // Scroll iframe to requested section (from left panel jump links).
  useEffect(() => {
    if (!isWebOrDash) return;
    if (!scrollToSectionType) return;
    const iframe = mainIframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    const el = doc.querySelector<HTMLElement>(`[data-section-type="${scrollToSectionType}"]`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setScrollToSectionType(null);
    }
  }, [scrollToSectionType, isWebOrDash, setScrollToSectionType]);

  // Platform spec info
  const platformSpec = PLATFORM_SPECS[platform];
  const specDims = isSocial ? dimensions : (platformSpec?.defaultDimensions?.[format] ?? dimensions);
  const renderScale = previewMode === "fit" ? fitScale * zoomLevel : zoomLevel;
  const effectiveScale = renderScale * (isFocusMode ? focusScale : 1);
  const frameBoxW = Math.max(1, Math.round(fitBoxW * effectiveScale));
  const frameBoxH = Math.max(1, Math.round(fitBoxH * effectiveScale));
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const designDoc = useMemo(
    () =>
      injectIframeResetAndRoot(
        sanitizeHtmlForIframe(effectiveHtml || "<div></div>"),
        isWebOrDash ? iframeWidth : undefined
        ,
        isWebOrDash && breakpoint !== "desktop"
        ,
        baseHref,
        !isWebOrDash
      ),
    [effectiveHtml, iframeWidth, isWebOrDash, breakpoint, baseHref]
  );

  const sectionPlan = (lastGenerationMeta as any)?.sectionPlan as string[] | undefined;
  const hasSectionNav = isWebOrDash && Array.isArray(sectionPlan) && sectionPlan.length >= 4;

  const resetViewportTop = () => {
    const el = artboardRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  };

  return (
    <>
      {isFocusMode ? (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[1px]"
          onClick={() => setIsFocusMode(false)}
        />
      ) : null}
      <div
        id={`workspace-preview-panel${idSuf}`}
        className={`relative flex h-full flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--background))] ${
          isFocusMode
            ? "fixed inset-3 z-[80] overflow-hidden rounded-[var(--radius-card)] border shadow-2xl"
            : ""
        }`}
      >
      {/* Top toolbar */}
      <div className="z-30 shrink-0">
        <WorkspacePreviewToolbar idSuffix={layout === "mobile" ? "-mobile" : ""} />
      </div>

      {/* Info badge (hidden for social to avoid duplicate badges) */}
      {!isSocial ? (
        <div className="absolute left-3 top-14 z-20 rounded bg-[hsl(var(--surface-elevated))]/80 px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          {(lastGenerationMeta?.platform ?? "Design").toString()} •{" "}
          {(lastGenerationMeta?.format ?? "preview").toString()} • {iframeWidth}x{iframeHeight}
          {slides.length > 1 ? (
            <span className="ml-2">
              {slideMode === "multi-screen" ? "Screen" : "Slide"} {activeSlide + 1} of {slides.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Social platform specs card */}
      {isSocial && platformSpec && (
        <div className="absolute right-3 top-14 z-20 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/90 px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))] backdrop-blur">
          {platform} • {format} • {specDims.width}x{specDims.height}
        </div>
      )}

      {/* Website/Dashboard section navigation overlay */}
      {hasSectionNav && !responsiveMode ? (
        <div className="absolute right-6 top-14 z-20 flex flex-col gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/80 p-1 text-[10px] backdrop-blur">
          {sectionPlan!.map((s, idx) => (
            <button
              key={`${s}-${idx}`}
              type="button"
              onClick={() => setScrollToSectionType(s)}
              className="group flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-[hsl(var(--surface))]"
              title={`Jump to ${s}`}
            >
              <span className="min-w-4 text-[10px] text-[hsl(var(--muted-foreground))]">{idx + 1}</span>
              <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-[hsl(var(--muted-foreground))] opacity-0 transition-opacity group-hover:opacity-100">
                {s.replace(/_/g, " ")}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Mobile device switcher */}
      {isMobile && (
        <div className="absolute left-3 bottom-20 z-20 flex flex-col gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/90 p-1.5 backdrop-blur">
          {(Object.keys(MOBILE_DEVICE_PRESETS) as MobileDeviceId[]).map((id) => {
            const p = MOBILE_DEVICE_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveDeviceId(id)}
                className={`rounded px-2 py-1 text-left text-[10px] ${
                  activeDeviceId === id
                    ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface))]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <div className="mt-1 flex gap-1 border-t border-[hsl(var(--border))] pt-1">
            <button
              type="button"
              className={`flex-1 rounded px-1 py-0.5 text-[9px] ${
                deviceOrientation === "portrait" ? "bg-[hsl(var(--accent-muted))]" : ""
              }`}
              onClick={() => setDeviceOrientation("portrait")}
            >
              Portrait
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-1 py-0.5 text-[9px] ${
                deviceOrientation === "landscape" ? "bg-[hsl(var(--accent-muted))]" : ""
              }`}
              onClick={() => setDeviceOrientation("landscape")}
            >
              Landscape
            </button>
          </div>
        </div>
      )}

      {/* Main artboard */}
      <div
        ref={artboardRef}
        className={`flex-1 bg-[hsl(var(--background))] p-0 ${isWebOrDash ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"}`}
        style={isFocusMode ? { touchAction: "none" } : undefined}
      >
        <div
          className={`flex h-full w-full justify-center ${
            previewMode === "actual" && isWebOrDash
              ? "items-start"
              : "items-center"
          } ${isWebOrDash ? "overflow-x-hidden" : "overflow-hidden"}`}
        >
          {isLoading && !previewHtml ? (
            <div className="flex flex-col items-center gap-3">
              <div
                className="animate-pulse rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
                style={{ width: iframeWidth, height: displayedIframeHeight }}
              />
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                {statusMessage ?? "Preparing your design..."}
              </div>
            </div>
          ) : generationState === "error" ? (
            <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-5 py-4 text-center">
              <div className="text-sm font-medium">
                {generationError?.message || "Generation failed. Please try again."}
              </div>
              <div className="mt-3">
                <Button
                  onClick={() => {
                    if (!lastPrompt || !activeBrandProfileId) return;
                    void startGeneration({
                      prompt: lastPrompt,
                      brandId: activeBrandProfileId,
                      referenceImageUrl: referenceImageUrl ?? undefined,
                    });
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : responsiveMode && isWebOrDash ? (
            /* Responsive 3-pane view */
            <div className="flex items-start gap-4 overflow-x-auto pb-4">
              {[
                { label: "Desktop", w: 1440, icon: Monitor },
                { label: "Tablet", w: 768, icon: Tablet },
                { label: "Mobile", w: 375, icon: Smartphone },
              ].map(({ label, w, icon: Icon }) => {
                const scale = Math.min(250 / w, 1);
                return (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      <Icon className="h-3 w-3" />
                      {label}
                    </div>
                    <div
                      className="overflow-hidden rounded border border-[hsl(var(--border))]"
                      style={{ width: w * scale, height: displayedIframeHeight * scale }}
                    >
                      <div style={{ width: w, height: displayedIframeHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                        <iframe
                          title={`${label} preview`}
                          sandbox="allow-scripts allow-same-origin"
                          srcDoc={sanitizeHtmlForIframe(effectiveHtml || "<div></div>")}
                          className="h-full w-full border-0"
                          style={{ width: w, height: displayedIframeHeight }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className={`relative overflow-hidden transition-all duration-200 ${
                flashBorder ? "workspace-version-flash" : ""
              }`}
              style={{ width: frameBoxW, height: frameBoxH }}
            >
              <div
                style={{
                  width: fitBoxW,
                  height: fitBoxH,
                  transform: `scale(${effectiveScale})`,
                  transformOrigin: "top left",
                }}
              >
              {isMobile ? (
                mobilePreset.os === "android" ? (
                  <AndroidFrame width={iframeWidth} height={iframeHeight}>
                    <div className="relative h-full w-full bg-white">
                      <MobileStatusBar
                        variant="android"
                        className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/40 to-transparent"
                      />
                      <PreviewErrorBoundary>
                        <iframe
                          title="Design preview"
                          ref={mainIframeRef}
                          sandbox="allow-scripts allow-same-origin"
                          srcDoc={designDoc}
                          className="absolute inset-0 border-0"
                          style={{ width: "100%", height: "100%", display: "block" }}
                        />
                      </PreviewErrorBoundary>
                    </div>
                  </AndroidFrame>
                ) : mobilePreset.os === "tablet" ? (
                  <TabletFrame width={iframeWidth} height={iframeHeight}>
                    <div className="relative h-full w-full bg-white">
                      <MobileStatusBar
                        variant="ios"
                        className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/40 to-transparent"
                      />
                      <PreviewErrorBoundary>
                        <iframe
                          title="Design preview"
                          ref={mainIframeRef}
                          sandbox="allow-scripts allow-same-origin"
                          srcDoc={designDoc}
                          className="absolute inset-0 border-0"
                          style={{ width: "100%", height: "100%", display: "block" }}
                        />
                      </PreviewErrorBoundary>
                    </div>
                  </TabletFrame>
                ) : (
                  <IosFrame width={iframeWidth} height={iframeHeight}>
                    <div className="relative h-full w-full bg-white">
                      <MobileStatusBar
                        variant="ios"
                        className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/40 to-transparent"
                      />
                      <PreviewErrorBoundary>
                        <iframe
                          title="Design preview"
                          ref={mainIframeRef}
                          sandbox="allow-scripts allow-same-origin"
                          srcDoc={designDoc}
                          className="absolute inset-0 border-0"
                          style={{ width: "100%", height: "100%", display: "block" }}
                        />
                      </PreviewErrorBoundary>
                    </div>
                  </IosFrame>
                )
              ) : (
                <>
                  {platform === "dashboard" && (
                    <div className="flex items-center gap-1.5 bg-[#2a2a2a] px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                      <div className="ml-2 flex-1 rounded bg-[#3a3a3a] px-2 py-0.5 text-[10px] text-[#888]">
                        https://dashboard.example.com
                      </div>
                    </div>
                  )}
                  <PreviewErrorBoundary>
                    <iframe
                      title="Design preview"
                      ref={mainIframeRef}
                      sandbox="allow-scripts allow-same-origin"
                      srcDoc={designDoc}
                      className="border-0"
                      style={{
                        width: `${iframeWidth}px`,
                        minWidth: `${iframeWidth}px`,
                        maxWidth: `${iframeWidth}px`,
                        height: `${displayedIframeHeight}px`,
                        overflowX: "hidden",
                        display: "block",
                      }}
                    />
                  </PreviewErrorBoundary>
                </>
              )}
              </div>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/92 px-4 py-2 shadow-md backdrop-blur">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[hsl(var(--muted-foreground))]/30 border-t-[hsl(var(--accent))]" />
              <span className="text-sm text-[hsl(var(--foreground))]">
                {statusMessage ?? "Generating design..."}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Carousel dot nav + social thumbnail strip */}
      {showSlidesControls ? (
        slideMode === "multi-screen" ? (
          <div className="absolute inset-y-16 left-3 z-10 flex w-20 flex-col gap-2 rounded bg-[hsl(var(--surface-elevated))]/90 p-2">
            {slides.map((slideHtml, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSlide(idx)}
                className={`relative h-12 w-full overflow-hidden rounded border ${
                  idx === activeSlide ? "border-[hsl(var(--accent))]" : "border-[hsl(var(--border))]"
                } bg-[hsl(var(--background))]`}
              >
                <div style={{ width: iframeWidth, height: displayedIframeHeight, transform: `scale(${60 / iframeWidth})`, transformOrigin: "top left", pointerEvents: "none" }}>
                  <iframe
                    title={`Screen ${idx + 1} thumb`}
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={sanitizeHtmlForIframe(slideHtml)}
                    className="border-0"
                    style={{ width: iframeWidth, height: displayedIframeHeight }}
                  />
                </div>
                <span className="absolute left-1 top-1 text-[9px] text-[hsl(var(--muted-foreground))]">{idx + 1}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Dot nav */}
            <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[hsl(var(--surface-elevated))]/90 px-3 py-1.5 text-xs">
              <button
                type="button"
                className="px-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
                disabled={activeSlide === 0}
                onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
              >
                ←
              </button>
              <div className="flex items-center gap-1.5">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveSlide(idx)}
                    className={`h-1.5 w-1.5 rounded-full ${
                      idx === activeSlide ? "bg-[hsl(var(--accent))]" : "bg-[hsl(var(--muted-foreground))]/60"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                className="px-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
                disabled={activeSlide >= slides.length - 1}
                onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
              >
                →
              </button>
            </div>

            {/* Social thumbnail strip (≥3 slides) */}
            {isSocial && slides.length >= 3 && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/90 p-1.5 backdrop-blur">
                {slides.map((slideHtml, idx) => {
                  const thumbW = 40;
                  const thumbH = Math.round((displayedIframeHeight / iframeWidth) * thumbW);
                  const sc = thumbW / iframeWidth;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveSlide(idx)}
                      className={`relative overflow-hidden rounded ${
                        idx === activeSlide ? "ring-2 ring-[hsl(var(--accent))]" : ""
                      }`}
                      style={{ width: thumbW, height: thumbH }}
                    >
                      <div style={{ width: iframeWidth, height: displayedIframeHeight, transform: `scale(${sc})`, transformOrigin: "top left", pointerEvents: "none" }}>
                        <iframe
                          title={`Slide ${idx + 1} thumb`}
                          sandbox="allow-scripts allow-same-origin"
                          srcDoc={sanitizeHtmlForIframe(slideHtml)}
                          className="border-0"
                          style={{ width: iframeWidth, height: displayedIframeHeight }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )
      ) : null}

      {/* Zoom / fit controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setIsFocusMode((v) => !v)}
          title={isFocusMode ? "Exit focus preview" : "Expand preview"}
          className="gap-1"
        >
          {isFocusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant={previewMode === "fit" ? "default" : "secondary"}
          onClick={() => {
            setPreviewMode("fit");
            setZoomLevel(1);
            resetViewportTop();
          }}
        >
          Fit
        </Button>
        <Button
          size="sm"
          variant={previewMode === "actual" ? "default" : "secondary"}
          onClick={() => {
            setPreviewMode("actual");
            setZoomLevel(1);
            setFocusScale(1);
            resetViewportTop();
          }}
        >
          100%
        </Button>
        {isFocusMode ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setFocusScale(1)}
            title="Reset focus zoom"
          >
            Reset
          </Button>
        ) : null}
        <span className="px-1 text-xs text-[hsl(var(--muted-foreground))]">
          {Math.round((isFocusMode ? focusScale * zoomLevel : zoomLevel) * 100)}%
        </span>
        <Button size="sm" variant="secondary" onClick={() => setZoomLevel(zoomLevel - 0.1)}>-</Button>
        <Button size="sm" variant="secondary" onClick={() => setZoomLevel(zoomLevel + 0.1)}>+</Button>
      </div>

      {/* Breakpoint controls for website/dashboard */}
      {isWebOrDash ? (
        <div className="absolute bottom-3 left-3 z-10 flex gap-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-2">
          <Button size="sm" variant={breakpoint === "desktop" ? "default" : "secondary"} onClick={() => setBreakpoint("desktop")}>
            <Monitor className="mr-1 h-4 w-4" />
            Desktop
          </Button>
          <Button size="sm" variant={breakpoint === "tablet" ? "default" : "secondary"} onClick={() => setBreakpoint("tablet")}>
            <Tablet className="mr-1 h-4 w-4" />
            Tablet
          </Button>
          <Button size="sm" variant={breakpoint === "mobile" ? "default" : "secondary"} onClick={() => setBreakpoint("mobile")}>
            <Smartphone className="mr-1 h-4 w-4" />
            Mobile
          </Button>
        </div>
      ) : null}

      </div>
    </>
  );
}
