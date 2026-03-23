'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
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
  } = useWorkspaceStore((s) => s);

  const [flashBorder, setFlashBorder] = useState(false);
  const [slides, setSlides] = useState<string[]>([]);
  const [slideMode, setSlideMode] = useState<SlideMode>("single");
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const mainIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [responsiveMode, setResponsiveMode] = useState(false);
  const [autoHeightPx, setAutoHeightPx] = useState<number | null>(null);

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

  // Default multi-breakpoint view for website designs.
  useEffect(() => {
    if (platform === "website") setResponsiveMode(true);
  }, [platform]);

  const dimensions = useMemo(() => {
    if (isMobile) {
      return { width: orientedDevice.width, height: orientedDevice.height };
    }
    const d = lastGenerationMeta?.dimensions;
    if (!d) return { width: 1080, height: 1080 };
    if (typeof (d as any).height === "string" && (d as any).height === "auto") {
      return { width: (d as any).width ?? 1080, height: 900 };
    }
    return d as any;
  }, [lastGenerationMeta?.dimensions, isMobile, orientedDevice.height, orientedDevice.width]);

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
      const padding = 48;
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
  const specDims = platformSpec?.defaultDimensions?.[format] ?? dimensions;

  const sectionPlan = (lastGenerationMeta as any)?.sectionPlan as string[] | undefined;
  const hasSectionNav = isWebOrDash && Array.isArray(sectionPlan) && sectionPlan.length >= 4;

  return (
    <div
      id={`workspace-preview-panel${idSuf}`}
      className="relative flex h-full flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--background))]"
    >
      {/* Top toolbar */}
      <div className="z-30 shrink-0">
        <WorkspacePreviewToolbar idSuffix={layout === "mobile" ? "-mobile" : ""} />
      </div>

      {/* Info badge */}
      <div className="absolute left-3 top-14 z-20 rounded bg-[hsl(var(--surface-elevated))]/80 px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
        {(lastGenerationMeta?.platform ?? "Design").toString()} •{" "}
        {(lastGenerationMeta?.format ?? "preview").toString()} • {iframeWidth}x{iframeHeight}
        {slides.length > 1 ? (
          <span className="ml-2">
            {slideMode === "multi-screen" ? "Screen" : "Slide"} {activeSlide + 1} of {slides.length}
          </span>
        ) : null}
      </div>

      {/* Social platform specs card */}
      {isSocial && platformSpec && (
        <div className="absolute right-3 top-3 z-20 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/90 p-2 text-[10px] text-[hsl(var(--muted-foreground))] backdrop-blur">
          <div className="font-semibold text-[hsl(var(--foreground))]">{platformSpec.displayName}</div>
          <div>{format} · {specDims.width}×{specDims.height}px</div>
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

      {/* Responsive toggle for web/dashboard */}
      {isWebOrDash && (
        <div className="absolute bottom-28 right-3 z-20">
          <Button
            size="sm"
            variant={responsiveMode ? "default" : "secondary"}
            onClick={() => setResponsiveMode((v) => !v)}
          >
            Responsive
          </Button>
        </div>
      )}

      {/* Main artboard */}
      <div ref={artboardRef} className="flex-1 overflow-auto bg-[hsl(var(--background))] p-6">
        <div className="flex min-h-full items-center justify-center">
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
                          sandbox="allow-scripts"
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
              className={`overflow-hidden transition-all duration-200 ${
                flashBorder ? "workspace-version-flash" : ""
              } ${
                isMobile
                  ? "border-0 bg-transparent shadow-none"
                  : "rounded border border-[hsl(var(--border))] bg-white"
              }`}
              style={{
                width: isMobile ? "auto" : iframeWidth,
                height: isMobile ? "auto" : displayedIframeHeight,
                transform:
                  previewMode === "fit"
                    ? `scale(${fitScale * zoomLevel})`
                    : `scale(${1})`,
                transformOrigin: "top center",
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
                          sandbox="allow-scripts"
                          srcDoc={sanitizeHtmlForIframe(effectiveHtml || "<div></div>")}
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
                          sandbox="allow-scripts"
                          srcDoc={sanitizeHtmlForIframe(effectiveHtml || "<div></div>")}
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
                          sandbox="allow-scripts"
                          srcDoc={sanitizeHtmlForIframe(effectiveHtml || "<div></div>")}
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
                      sandbox="allow-scripts"
                      srcDoc={sanitizeHtmlForIframe(effectiveHtml || "<div></div>")}
                      className="border-0"
                      style={{
                        width: iframeWidth,
                        height: platform === "dashboard" ? displayedIframeHeight - 34 : displayedIframeHeight,
                        display: "block",
                      }}
                    />
                  </PreviewErrorBoundary>
                </>
              )}
            </div>
          )}
        </div>
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
                    sandbox=""
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
                          sandbox=""
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
        <Button size="sm" variant={previewMode === "fit" ? "default" : "secondary"} onClick={() => setPreviewMode("fit")}>
          Fit
        </Button>
        <Button size="sm" variant={previewMode === "actual" ? "default" : "secondary"} onClick={() => setPreviewMode("actual")}>
          100%
        </Button>
        <span className="px-1 text-xs text-[hsl(var(--muted-foreground))]">
          {Math.round(zoomLevel * 100)}%
        </span>
        <Button size="sm" variant="secondary" onClick={() => setZoomLevel(zoomLevel - 0.1)}>-</Button>
        <Button size="sm" variant="secondary" onClick={() => setZoomLevel(zoomLevel + 0.1)}>+</Button>
      </div>

      {/* Breakpoint controls for web/dash */}
      {isWebOrDash ? (
        <div className="absolute bottom-14 right-3 z-10 flex gap-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-2">
          <Button size="sm" variant={breakpoint === "desktop" ? "default" : "secondary"} onClick={() => setBreakpoint("desktop")}>
            Desktop
          </Button>
          <Button size="sm" variant={breakpoint === "tablet" ? "default" : "secondary"} onClick={() => setBreakpoint("tablet")}>
            Tablet
          </Button>
          <Button size="sm" variant={breakpoint === "mobile" ? "default" : "secondary"} onClick={() => setBreakpoint("mobile")}>
            Mobile
          </Button>
        </div>
      ) : null}
    </div>
  );
}
