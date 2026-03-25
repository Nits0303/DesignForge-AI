"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateBrowser } from "@/components/workspace/TemplateBrowser";
import { DimensionSelector } from "@/components/workspace/DimensionSelector";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useDesignGeneration } from "@/hooks/useDesignGeneration";
import { ShortcodeAutocomplete } from "@/components/workspace/ShortcodeAutocomplete";
import { DEFAULT_SECTION_PLANS } from "@/constants/sectionDefaults";
import type { ActiveReference } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";
import { useBrandStore } from "@/store/useBrandStore";
import {
  brandSwatchesInSemanticOrder,
  FALLBACK_BRAND_SWATCHES,
} from "@/lib/brand/colorSwatches";
import { DEFERRED_PROJECT_IDLE_MS } from "@/constants/deferredProjectAttach";

const MAX_PROMPT_CHARS = 2000;
const SHORTCODES = [
  "/instagram",
  "/linkedin",
  "/facebook",
  "/twitter",
  "/website",
  "/mobile",
  "/dashboard",
];

function detectPlatformHint(p: string): "instagram" | "linkedin" | "facebook" | "twitter" | "website" | "mobile" | "dashboard" | null {
  const m = String(p ?? "").trim().match(/^\/(instagram|linkedin|facebook|twitter|website|mobile|dashboard)\b/i);
  if (!m) return null;
  return m[1]!.toLowerCase() as any;
}

export function WorkspacePromptPanel({
  prompt,
  setPrompt,
  layout = "desktop",
}: {
  prompt: string;
  setPrompt: (p: string) => void;
  /** Mobile sheet duplicates this panel; use distinct ids to avoid duplicate id violations. */
  layout?: "desktop" | "mobile";
}) {
  const idSuf = layout === "mobile" ? "-mobile" : "";
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("projectId");

  const enqueueToast = useUIStore((s) => s.enqueueToast);
  const { startGeneration } = useDesignGeneration();
  const deferredProjectId = useWorkspaceStore((s) => s.deferredProjectId);
  const deferredProjectName = useWorkspaceStore((s) => s.deferredProjectName);
  const setDeferredProject = useWorkspaceStore((s) => s.setDeferredProject);
  const clearDeferredProject = useWorkspaceStore((s) => s.clearDeferredProject);
  const generationState = useWorkspaceStore((s) => s.generationState);
  const lastMeta = useWorkspaceStore((s) => s.lastGenerationMeta);
  const activeBrandProfileId = useWorkspaceStore((s) => s.activeBrandProfileId);
  const referenceImageUrl = useWorkspaceStore((s) => s.referenceImageUrl);
  const setReferenceImageUrl = useWorkspaceStore((s) => s.setReferenceImageUrl);
  const activeReferences = useWorkspaceStore((s) => s.activeReferences);
  const setActiveReferences = useWorkspaceStore((s) => s.setActiveReferences);
  const upsertActiveReference = useWorkspaceStore((s) => s.upsertActiveReference);
  const removeActiveReference = useWorkspaceStore((s) => s.removeActiveReference);
  const updateReferenceAnalysis = useWorkspaceStore((s) => s.updateReferenceAnalysis);
  const setScrollToSectionType = useWorkspaceStore((s) => s.setScrollToSectionType);
  const brands = useBrandStore((s) => s.brands);

  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [referenceTab, setReferenceTab] = useState<"upload" | "saved" | "url">("upload");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modelOverride, setModelOverride] = useState<"auto" | "sonnet" | "opus">("auto");
  const [allowImages, setAllowImages] = useState(true);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isAnalyzingReference, setIsAnalyzingReference] = useState(false);
  const [isCapturingUrl, setIsCapturingUrl] = useState(false);
  const [referenceUrlInput, setReferenceUrlInput] = useState("");
  const [savedRefs, setSavedRefs] = useState<any[]>([]);
  const [analysisExpandedId, setAnalysisExpandedId] = useState<string | null>(null);
  const [brokenRefs, setBrokenRefs] = useState<Record<string, boolean>>({});
  const [fastStrategy, setFastStrategy] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [draftPlan, setDraftPlan] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [showProjectOptions, setShowProjectOptions] = useState(false);
  const [showShortcodesMenu, setShowShortcodesMenu] = useState(false);
  const shortcodesRef = useRef<HTMLDivElement | null>(null);

  const idleHuman =
    DEFERRED_PROJECT_IDLE_MS < 120_000
      ? `${Math.round(DEFERRED_PROJECT_IDLE_MS / 1000)} seconds`
      : `${Math.max(1, Math.round(DEFERRED_PROJECT_IDLE_MS / 60000))} minutes`;

  useEffect(() => {
    if (urlProjectId) clearDeferredProject();
  }, [urlProjectId, clearDeferredProject]);

  useEffect(() => {
    if (!showShortcodesMenu) return;

    function onPointerDown(e: PointerEvent) {
      const wrap = shortcodesRef.current;
      if (!wrap) return;
      const target = e.target;
      if (target instanceof Node && !wrap.contains(target)) {
        setShowShortcodesMenu(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowShortcodesMenu(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showShortcodesMenu]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/projects");
      const json = await res.json();
      if (res.ok && json.success) {
        const rows = (json.data ?? []) as Array<{ id: string; name: string }>;
        setProjects(rows.map((p) => ({ id: p.id, name: p.name })));
      }
    })();
  }, []);

  const urlProjectLabel = useMemo(() => {
    if (!urlProjectId) return null;
    const p = projects.find((x) => x.id === urlProjectId);
    return p?.name ?? "this project";
  }, [urlProjectId, projects]);

  const remaining = MAX_PROMPT_CHARS - prompt.length;
  const isGenerating =
    generationState === "connecting" ||
    generationState === "generating" ||
    generationState === "processing_images";

  const lastPlatform = (lastMeta?.platform ?? "") as string;
  const currentSectionPlan = Array.isArray(lastMeta?.sectionPlan) ? (lastMeta?.sectionPlan as string[]) : null;
  const isWebOrDash = lastPlatform === "website" || lastPlatform === "dashboard";
  const showSectionPlanEditor = isWebOrDash && currentSectionPlan && currentSectionPlan.length >= 2;
  const platformHint = useMemo(() => detectPlatformHint(prompt), [prompt]);
  const showDimensionSelector =
    !platformHint || ["instagram", "linkedin", "facebook", "twitter"].includes(platformHint);

  const availableSectionPool = useMemo(() => {
    if (!isWebOrDash) return [];
    if (lastPlatform === "website") {
      const keys = Object.keys(DEFAULT_SECTION_PLANS.website);
      const pool = new Set<string>();
      for (const k of keys) {
        for (const s of DEFAULT_SECTION_PLANS.website[k] ?? []) pool.add(s);
      }
      return [...pool];
    }
    const keys = Object.keys(DEFAULT_SECTION_PLANS.dashboard);
    const pool = new Set<string>();
    for (const k of keys) {
      for (const s of DEFAULT_SECTION_PLANS.dashboard[k] ?? []) pool.add(s);
    }
    return [...pool];
  }, [isWebOrDash, lastPlatform]);

  useEffect(() => {
    if (!showSectionPlanEditor || !currentSectionPlan) return;
    if (!editingPlan) setDraftPlan(currentSectionPlan);
  }, [showSectionPlanEditor, currentSectionPlan, editingPlan]);

  const activeBrand = useMemo(
    () => brands.find((b) => b.id === activeBrandProfileId) ?? brands.find((b) => b.isDefault) ?? null,
    [brands, activeBrandProfileId]
  );
  const swatches = useMemo(() => {
    if (!activeBrand?.colors) return FALLBACK_BRAND_SWATCHES;
    const list = brandSwatchesInSemanticOrder(activeBrand.colors as Record<string, unknown>);
    return list.length ? list : FALLBACK_BRAND_SWATCHES;
  }, [activeBrand]);

  // Persist reference image per brand in localStorage
  useEffect(() => {
    if (!activeBrandProfileId) return;
    try {
      const key = `df:reference:${activeBrandProfileId}`;
      const stored = localStorage.getItem(key);
      if (stored && !referenceImageUrl) {
        setReferenceImageUrl(stored);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandProfileId]);

  useEffect(() => {
    if (!activeBrandProfileId) return;
    try {
      const key = `df:reference:${activeBrandProfileId}`;
      if (referenceImageUrl) {
        localStorage.setItem(key, referenceImageUrl);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }, [activeBrandProfileId, referenceImageUrl, setReferenceImageUrl]);

  useEffect(() => {
    if (!showReference || referenceTab !== "saved") return;
    (async () => {
      const res = await fetch("/api/references");
      const json = await res.json();
      if (res.ok && json.success) setSavedRefs(json.data ?? []);
    })();
  }, [showReference, referenceTab]);

  // Persist and restore active references across workspace reloads.
  useEffect(() => {
    if (!activeBrandProfileId) return;
    try {
      const key = `df:references:${activeBrandProfileId}`;
      const payload = activeReferences.map((r) => ({
        referenceId: r.referenceId,
        role: r.role,
        applying: r.applying,
      }));
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {}
  }, [activeBrandProfileId, activeReferences]);

  useEffect(() => {
    if (!activeBrandProfileId) return;
    try {
      const key = `df:references:${activeBrandProfileId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{
        referenceId: string;
        role: "layout" | "style" | "color";
        applying: boolean;
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0 || activeReferences.length > 0) return;
      void (async () => {
        const loaded: ActiveReference[] = [];
        for (const p of parsed.slice(0, 3)) {
          const res = await fetch(`/api/references/${p.referenceId}/activate`, { method: "POST" });
          const json = await res.json();
          if (!res.ok || !json.success) continue;
          const d = json.data;
          loaded.push({
            referenceId: d.id,
            visionUrl: d.visionUrl,
            thumbnailUrl: d.thumbnailUrl,
            role: p.role,
            applying: p.applying,
            analysis: (d.analysisJson as any) ?? null,
            analysisLoading: false,
          });
        }
        if (loaded.length > 0) {
          setActiveReferences(loaded);
          setReferenceImageUrl(loaded[0]?.visionUrl ?? null);
        }
      })();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandProfileId]);

  const roleMap = useMemo(() => {
    const out: Record<string, "layout" | "style" | "color"> = {};
    for (const r of activeReferences) out[r.referenceId] = r.role;
    return out;
  }, [activeReferences]);

  async function runAnalysis(referenceId: string, forceFresh = false) {
    setIsAnalyzingReference(true);
    try {
      const res = await fetch("/api/analyze/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId, forceFresh }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const analysis = json.data?.analysis ?? json.data;
        if (analysis?.contentRejected) {
          removeActiveReference(referenceId);
          enqueueToast({
            title: "Reference rejected",
            description:
              "This reference image could not be analyzed. Please upload a design screenshot or UI reference.",
            type: "error",
          });
          return;
        }
        updateReferenceAnalysis(referenceId, analysis ?? null);
      } else {
        updateReferenceAnalysis(referenceId, null);
      }
    } finally {
      setIsAnalyzingReference(false);
    }
  }

  async function attachReferenceFromUploadResponse(data: any) {
    if (activeReferences.length >= 3) return;
    const ref: ActiveReference = {
      referenceId: data.referenceId,
      visionUrl: data.visionUrl,
      thumbnailUrl: data.thumbnailUrl,
      role: activeReferences.length === 0 ? "style" : activeReferences.length === 1 ? "layout" : "color",
      applying: true,
      analysis: null,
      analysisLoading: true,
    };
    upsertActiveReference(ref);
    setReferenceImageUrl(data.visionUrl);
    await runAnalysis(data.referenceId);
  }

  async function ensureAppliedReferencesAnalyzed() {
    const pending = useWorkspaceStore
      .getState()
      .activeReferences.filter((r) => r.applying && (!r.analysis || r.analysisLoading))
      .map((r) => r.referenceId);
    if (!pending.length) return;
    setIsAnalyzingReference(true);
    try {
      await Promise.all(pending.map((id) => runAnalysis(id, true)));
    } finally {
      setIsAnalyzingReference(false);
    }
  }

  return (
    <div
      id={`workspace-prompt-panel${idSuf}`}
      className="relative h-full overflow-y-auto border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4"
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Generate Design</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Describe your design intent and generate in real time.
          </p>
        </div>

        <ShortcodeAutocomplete
          textareaId={`workspace-prompt-input${idSuf}`}
          value={prompt}
          onChange={(val) => setPrompt(val.slice(0, MAX_PROMPT_CHARS))}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="relative" ref={shortcodesRef}>
            <button
              type="button"
              onClick={() => setShowShortcodesMenu((v) => !v)}
              className="flex cursor-pointer list-none items-center gap-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]"
              aria-expanded={showShortcodesMenu}
            >
                Shortcodes <ChevronDown className="h-3 w-3" />
            </button>
            {showShortcodesMenu ? (
              <div className="absolute z-30 mt-1 w-36 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-1">
                {SHORTCODES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-[hsl(var(--accent-muted))]"
                    onClick={() => {
                      const next = prompt.startsWith("/") ? prompt : `${s} ${prompt}`.trim();
                      setPrompt(next);
                      setShowShortcodesMenu(false);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">{remaining} left</div>
        </div>

        <Button
          id={`generate-btn${idSuf}`}
          className="w-full"
          disabled={isGenerating || !prompt.trim() || !activeBrandProfileId}
          onClick={async () => {
            await ensureAppliedReferencesAnalyzed();
            startGeneration({
              prompt,
              brandId: activeBrandProfileId || "",
              projectId: urlProjectId || undefined,
              referenceImageUrl: referenceImageUrl ?? undefined,
              referenceIds: activeReferences.filter((r) => r.applying).map((r) => r.referenceId),
              referenceRoles: roleMap,
              strategy: isWebOrDash ? (fastStrategy ? "fast" : "quality") : "quality",
            });
          }}
        >
          {isGenerating ? "Generating..." : "Generate"}
        </Button>

        {urlProjectId ? (
          <div className="rounded-[var(--radius)] border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent-muted))]/30 px-3 py-2 text-xs text-[hsl(var(--foreground))]">
            <span className="font-medium">Project:</span> New designs are saved to{" "}
            <span className="font-semibold">{urlProjectLabel ?? "…"}</span> as soon as they are created.
          </div>
        ) : null}

        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
            onClick={() => setShowProjectOptions((v) => !v)}
          >
            <span>Add to existing project (optional)</span>
            <ChevronDown className={`h-4 w-4 transition ${showProjectOptions ? "rotate-180" : ""}`} />
          </button>
          {showProjectOptions ? (
            <div className="space-y-2 border-t border-[hsl(var(--border))] p-3 text-xs">
              {urlProjectId ? (
                <p className="text-[hsl(var(--muted-foreground))]">
                  Deferred assignment is disabled while you opened the workspace from a project link — designs are already
                  saved to that project on create.
                </p>
              ) : (
                <>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    After your last generation or revision has finished, stay idle for about{" "}
                    <span className="font-medium text-[hsl(var(--foreground))]">{idleHuman}</span> with no new edits. The
                    design is then added to the project you pick below (and still appears in My Designs).
                  </p>
                  <label
                    className="block text-[hsl(var(--muted-foreground))]"
                    htmlFor={`workspace-deferred-project${idSuf}`}
                  >
                    Project
                  </label>
                  <select
                    id={`workspace-deferred-project${idSuf}`}
                    className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-2 text-sm"
                    value={deferredProjectId ?? ""}
                    disabled={!projects.length}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      const row = projects.find((p) => p.id === id);
                      setDeferredProject(id, row?.name ?? null);
                    }}
                  >
                    <option value="">None — do not auto-assign</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {deferredProjectId ? (
                    <p className="text-[hsl(var(--muted-foreground))]">
                      Active: <span className="font-medium text-[hsl(var(--foreground))]">{deferredProjectName}</span>
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Brand profile
            </span>
          </div>
          <div className="mt-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm">
            <div className="font-semibold">{activeBrand?.name ?? "No active brand selected"}</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {activeBrand?.industry ? `Industry: ${activeBrand.industry}` : "Use the top brand switcher to change active brand"}
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            {swatches.map((sw) => (
              <span
                key={sw.role}
                className="h-3 w-3 rounded-full border border-[hsl(var(--border))]"
                style={{ backgroundColor: sw.value }}
                title={`${sw.role}: ${sw.value}`}
              />
            ))}
          </div>
        </div>

        <DimensionSelector
          visible={showDimensionSelector}
          platformHint={
            platformHint && ["twitter", "instagram", "linkedin", "facebook"].includes(platformHint)
              ? (platformHint as any)
              : null
          }
        />

        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
            onClick={() => setShowReference((v) => !v)}
          >
            <span>Reference image upload</span>
            <ChevronDown className={`h-4 w-4 transition ${showReference ? "rotate-180" : ""}`} />
          </button>
          {showReference ? (
            <div className="border-t border-[hsl(var(--border))] p-3">
              <div className="mb-2 flex gap-2 text-xs">
                {(["upload", "saved", "url"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setReferenceTab(tab)}
                    className={`rounded px-2 py-1 ${
                      referenceTab === tab
                        ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
                        : "text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {tab === "upload" ? "Upload" : tab === "saved" ? "Saved references" : "From URL"}
                  </button>
                ))}
              </div>

              {referenceTab === "upload" ? (
                <label className="block rounded-[var(--radius)] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  Upload a reference design for style inspiration
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const inputEl = e.currentTarget;
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingReference(true);
                      try {
                        const form = new FormData();
                        form.append("file", file);
                        const res = await fetch("/api/upload/image", { method: "POST", body: form });
                        const json = await res.json();
                        if (res.ok && json.success) {
                          await attachReferenceFromUploadResponse(json.data);
                          enqueueToast({
                            title: "Reference uploaded",
                            description: "Your reference image is attached for the next generation.",
                            type: "success",
                          });
                        } else {
                          enqueueToast({
                            title: "Upload failed",
                            description: json?.error?.message ?? "Could not upload this image. Try another file.",
                            type: "error",
                          });
                        }
                      } catch {
                        enqueueToast({
                          title: "Upload failed",
                          description: "Network or server error while uploading reference image.",
                          type: "error",
                        });
                      } finally {
                        setIsUploadingReference(false);
                        if (inputEl) inputEl.value = "";
                      }
                    }}
                  />
                </label>
              ) : null}

              {referenceTab === "url" ? (
                <div className="space-y-2">
                  <input
                    value={referenceUrlInput}
                    onChange={(e) => setReferenceUrlInput(e.target.value)}
                    placeholder="https://competitor.com"
                    className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 text-xs"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!referenceUrlInput.trim() || isCapturingUrl}
                    onClick={async () => {
                      setIsCapturingUrl(true);
                      try {
                        const res = await fetch("/api/references/from-url", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ url: referenceUrlInput.trim() }),
                        });
                        const json = await res.json();
                        if (res.ok && json.success) {
                          await attachReferenceFromUploadResponse(json.data);
                        }
                      } finally {
                        setIsCapturingUrl(false);
                      }
                    }}
                  >
                    {isCapturingUrl ? "Capturing screenshot..." : "Capture"}
                  </Button>
                </div>
              ) : null}

              {referenceTab === "saved" ? (
                <div className="grid grid-cols-2 gap-2">
                  {savedRefs.map((r) => (
                    <div key={r.id} className="rounded border border-[hsl(var(--border))] p-1 text-left">
                      <button
                        type="button"
                        className="w-full"
                        onClick={async () => {
                          const res = await fetch(`/api/references/${r.id}/activate`, { method: "POST" });
                          const json = await res.json();
                          if (res.ok && json.success) {
                            const d = json.data;
                            upsertActiveReference({
                              referenceId: d.id,
                              visionUrl: d.visionUrl,
                              thumbnailUrl: d.thumbnailUrl,
                              role: "style",
                              applying: true,
                              analysis: (d.analysisJson as any) ?? null,
                              analysisLoading: false,
                            });
                            setReferenceImageUrl(d.visionUrl);
                            if (!d.analysisJson) await runAnalysis(d.id);
                          }
                        }}
                        title={(r.analysisJson as any)?.overallDescription ?? ""}
                      >
                        <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.thumbnailUrl} alt={r.name ?? r.originalFilename} className="h-16 w-full rounded object-cover" />
                        {activeReferences.some((x) => x.referenceId === r.id) ? (
                          <span className="absolute right-1 top-1 rounded bg-[hsl(var(--accent))] px-1 text-[10px] text-white">
                            ✓
                          </span>
                        ) : null}
                        </div>
                      </button>
                      <div className="mt-1 truncate text-[10px]">{r.name ?? r.originalFilename}</div>
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          className="rounded border border-[hsl(var(--border))] px-1 text-[10px]"
                          onClick={async () => {
                            const name = window.prompt("Rename reference", r.name ?? r.originalFilename);
                            if (!name) return;
                            await fetch(`/api/references/${r.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name }),
                            });
                            setSavedRefs((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, name } : x))
                            );
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[hsl(var(--border))] px-1 text-[10px]"
                          onClick={async () => {
                            const yes = window.confirm("Delete this reference?");
                            if (!yes) return;
                            await fetch(`/api/references/${r.id}`, { method: "DELETE" });
                            setSavedRefs((prev) => prev.filter((x) => x.id !== r.id));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {(isUploadingReference || isAnalyzingReference) ? (
                <div className="mt-2 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[hsl(var(--surface))]" />
                  <div className="h-20 w-full animate-pulse rounded bg-[hsl(var(--surface))]" />
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {isUploadingReference ? "Uploading..." : "Analyzing reference design..."}
                  </div>
                </div>
              ) : null}

              {activeReferences.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {activeReferences.map((ref, idx) => (
                    <div key={ref.referenceId} className="space-y-2 rounded border border-[hsl(var(--border))] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ref.thumbnailUrl}
                        alt="Reference thumbnail"
                        className="h-32 w-full rounded object-cover"
                        onError={() =>
                          setBrokenRefs((prev) => ({ ...prev, [ref.referenceId]: true }))
                        }
                      />
                      {brokenRefs[ref.referenceId] ? (
                        <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                          Reference image no longer available. Analysis data is still being used.
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="inline-flex items-center gap-1 text-[hsl(var(--accent))]">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Style extracted</span>
                        </div>
                        <button
                          type="button"
                          className="rounded px-1 text-[hsl(var(--muted-foreground))]"
                          onClick={() => removeActiveReference(ref.referenceId)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                        <div>Layout: {ref.analysis?.layoutStructure?.type ?? "—"}</div>
                        <div>Mood: {ref.analysis?.visualStyle?.mood ?? "—"}</div>
                        {idx === 0 ? (
                          <>
                            <div>
                              Typography:{" "}
                              {ref.analysis?.typography
                                ? `${ref.analysis.typography.headingStyle ?? "—"} / ${
                                    ref.analysis.typography.bodyStyle ?? "—"
                                  }`
                                : "—"}
                            </div>
                            <div>Spacing: {ref.analysis?.spacing?.density ?? "—"}</div>
                          </>
                        ) : null}
                      </div>
                      {idx === 0 && ref.analysis?.colorPalette ? (
                        <div className="space-y-1">
                          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Detected in reference</div>
                          <div className="flex gap-1">
                            {(
                              [
                                ["dominant", ref.analysis.colorPalette.dominant],
                                ["background", ref.analysis.colorPalette.background],
                                ["text", ref.analysis.colorPalette.text],
                                ["accent", ref.analysis.colorPalette.accent],
                              ] as const
                            )
                              .filter(([, c]) => Boolean(c))
                              .map(([role, c]) => (
                                <span
                                  key={`${ref.referenceId}-${role}`}
                                  className="h-4 w-4 rounded border border-[hsl(var(--border))]"
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                          </div>
                        </div>
                      ) : null}
                      {idx === 0 && ref.analysis?.overallDescription ? (
                        <blockquote className="text-[10px] italic text-[hsl(var(--muted-foreground))]">
                          "{ref.analysis.overallDescription}"
                        </blockquote>
                      ) : null}
                      {idx === 0 &&
                      (ref.analysis?.platform?.detectedType === "unknown" ||
                        (ref.analysis?.visualStyle?.styleKeywords?.length ?? 0) === 0) ? (
                        <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                          We couldn't extract strong design patterns from this image. It will still be used as a general visual reference.
                        </div>
                      ) : null}
                      {idx === 0 ? (
                        <div className="flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                          <span>
                            {ref.analysis?.analyzedAt
                              ? `Analyzed ${
                                  ref.analysis.fromCache
                                    ? `${Math.max(
                                        1,
                                        Math.round(
                                          (Date.now() - new Date(ref.analysis.analyzedAt).getTime()) /
                                            (1000 * 60 * 60)
                                        )
                                      )}h ago (cached)`
                                    : "just now"
                                }`
                              : "Analysis pending"}
                          </span>
                          <button
                            type="button"
                            className="underline"
                            onClick={() => runAnalysis(ref.referenceId, true)}
                          >
                            Re-analyze
                          </button>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 text-[10px]">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={ref.applying}
                            onChange={(e) => upsertActiveReference({ ...ref, applying: e.target.checked })}
                          />
                          Applying to generation
                        </label>
                        <select
                          className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-1 py-0.5"
                          value={ref.role}
                          onChange={(e) => upsertActiveReference({ ...ref, role: e.target.value as any })}
                        >
                          <option value="layout">Layout reference</option>
                          <option value="style">Style reference</option>
                          <option value="color">Color reference</option>
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          onClick={async () => {
                            await fetch(`/api/references/${ref.referenceId}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ isSaved: true }),
                            });
                          }}
                        >
                          Save to library
                        </Button>
                      </div>
                      {ref.analysis?.platform?.suggestedShortcode && !prompt.trim().startsWith("/") ? (
                        <button
                          type="button"
                          className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                          onClick={() => setPrompt(`${ref.analysis!.platform.suggestedShortcode} ${prompt}`.trim())}
                        >
                          Try: {ref.analysis.platform.suggestedShortcode}
                        </button>
                      ) : null}
                      {idx === 0 ? (
                        <button
                        type="button"
                        className="text-[10px] text-[hsl(var(--muted-foreground))] underline"
                        onClick={() =>
                          setAnalysisExpandedId((p) =>
                            p === ref.referenceId ? null : ref.referenceId
                          )
                        }
                      >
                        View full analysis
                      </button>
                      ) : null}
                      {idx === 0 && analysisExpandedId === ref.referenceId && ref.analysis ? (
                        <pre className="max-h-40 overflow-auto rounded bg-[hsl(var(--surface))] p-2 text-[10px]">
                          {JSON.stringify(ref.analysis, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                  {activeReferences.length < 3 ? (
                    <button
                      type="button"
                      className="text-[10px] text-[hsl(var(--muted-foreground))] underline"
                      onClick={() => setReferenceTab("saved")}
                    >
                      Add another reference
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button
          id={`template-browser-btn${idSuf}`}
          variant="secondary"
          className="w-full"
          onClick={() => setShowTemplateBrowser((v) => !v)}
        >
          {showTemplateBrowser ? "Hide template browser" : "Show template browser"}
        </Button>

        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>Generation settings</span>
            <ChevronDown className={`h-4 w-4 transition ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
          {showAdvanced ? (
            <div className="space-y-3 border-t border-[hsl(var(--border))] p-3 text-xs">
              <div className="space-y-1">
                <label className="text-[hsl(var(--muted-foreground))]">Model override</label>
                <select
                  className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1"
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value as any)}
                >
                  <option value="auto">Auto</option>
                  <option value="sonnet">Force Sonnet</option>
                  <option value="opus">Force Opus</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowImages}
                  onChange={(e) => setAllowImages(e.target.checked)}
                />
                Allow image generation
              </label>
              {isWebOrDash ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fastStrategy}
                    onChange={(e) => setFastStrategy(e.target.checked)}
                  />
                  Generate faster (lower quality) for multi-section
                </label>
              ) : null}
              <div className="text-[hsl(var(--muted-foreground))]">
                Estimated tokens: {lastMeta?.estimatedTokens ?? "—"}
              </div>
            </div>
          ) : null}
        </div>

        {showSectionPlanEditor && currentSectionPlan ? (
          <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
            <div className="flex items-center justify-between gap-2 border-t border-[hsl(var(--border))] p-3">
              <div>
                <div className="text-xs font-semibold">Section plan</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{currentSectionPlan.length} sections</div>
              </div>
              <Button size="sm" variant={editingPlan ? "secondary" : "ghost"} onClick={() => setEditingPlan((v) => !v)}>
                {editingPlan ? "Done" : "Edit plan"}
              </Button>
            </div>

            {!editingPlan ? (
              <div className="flex flex-wrap gap-1.5 p-3 pt-2">
                {currentSectionPlan.map((s, idx) => (
                  <span
                    key={`${s}-${idx}`}
                    className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]"
                  >
                    {idx + 1}. {s.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            ) : (
              <div className="space-y-3 border-t border-[hsl(var(--border))] p-3 text-xs">
                <div className="space-y-2">
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Drag to reorder, remove, then regenerate.
                  </div>
                  <div className="flex flex-col gap-2">
                    {draftPlan.map((s, idx) => (
                      <div
                        key={`${s}-${idx}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(idx));
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = parseInt(e.dataTransfer.getData("text/plain") || "-1", 10);
                          if (Number.isNaN(from) || from < 0 || from === idx) return;
                          setDraftPlan((prev) => {
                            const next = [...prev];
                            const [item] = next.splice(from, 1);
                            next.splice(idx, 0, item);
                            return next;
                          });
                        }}
                        className="flex items-center justify-between gap-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-2"
                      >
                        <button
                          type="button"
                          className="text-[10px] text-[hsl(var(--foreground))]"
                          onMouseEnter={() => setScrollToSectionType(s)}
                          onClick={() => setScrollToSectionType(s)}
                          title="Jump to section in preview"
                        >
                          {idx + 1}. {s.replace(/_/g, " ")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftPlan((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="rounded px-1 py-0.5 text-[12px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                          aria-label={`Remove ${s}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <select
                    className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      setDraftPlan((prev) => [...prev, val]);
                      e.currentTarget.value = "";
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Add section...
                    </option>
                    {availableSectionPool.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      setEditingPlan(false);
                      await ensureAppliedReferencesAnalyzed();
                      void startGeneration({
                        prompt,
                        brandId: activeBrandProfileId || "",
                        referenceImageUrl: referenceImageUrl ?? undefined,
                        referenceIds: activeReferences.filter((r) => r.applying).map((r) => r.referenceId),
                        referenceRoles: roleMap,
                        strategy: fastStrategy ? "fast" : "quality",
                        sectionPlanOverride: draftPlan,
                      });
                    }}
                    disabled={!activeBrandProfileId || !prompt.trim()}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {showTemplateBrowser ? (
        <div className="absolute inset-y-0 right-0 left-0 z-[50]">
          {/* Clicking in any non-functional space closes the overlay */}
          <div
            className="absolute inset-0"
            onClick={() => setShowTemplateBrowser(false)}
            aria-hidden
          />

          <div
            className="absolute inset-y-0 right-0 w-[92%] border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-2 top-2 z-[60] h-8 w-8 p-0"
              onClick={() => setShowTemplateBrowser(false)}
              aria-label="Close template browser"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
            <TemplateBrowser
              onInsertHint={({ templateId, templateName, tags, category }) => {
                const bits = [
                  `Use template "${templateName}"`,
                  `(id: ${templateId})`,
                  `category: ${category}`,
                  tags.length ? `tags: ${tags.slice(0, 4).join(", ")}` : "",
                ]
                  .filter(Boolean)
                  .join(" • ");
                const next = prompt.trim().length
                  ? `${prompt.trim()}\n\n${bits}`
                  : bits;
                setPrompt(next.slice(0, MAX_PROMPT_CHARS));
                setShowTemplateBrowser(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

