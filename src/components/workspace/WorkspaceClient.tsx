"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkspacePromptPanel } from "@/components/workspace/WorkspacePromptPanel";
import { WorkspacePreviewPanel } from "@/components/workspace/WorkspacePreviewPanel";
import { WorkspaceRightPanel } from "@/components/workspace/WorkspaceRightPanel";
import { WorkspaceShortcutsModal } from "@/components/workspace/WorkspaceShortcutsModal";
import { WorkspaceTour } from "@/components/workspace/WorkspaceTour";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useWorkspaceKeyboardShortcuts } from "@/hooks/useWorkspaceKeyboardShortcuts";
import { useDeferredProjectAssignment } from "@/hooks/useDeferredProjectAssignment";

export function WorkspaceClient() {
  const router = useRouter();
  const search = useSearchParams();
  const designId = search.get("designId");
  const versionIdParam = search.get("versionId");
  const slideParam = search.get("slide");
  const initialPrompt = search.get("prompt") ?? "";

  const [prompt, setPrompt] = useState(initialPrompt);

  const setPreviewHtml = useWorkspaceStore((s) => s.setPreviewHtml);
  const setVersionHistory = useWorkspaceStore((s) => s.setVersionHistory);
  const setActiveVersionNumber = useWorkspaceStore((s) => s.setActiveVersionNumber);
  const setActiveDesignId = useWorkspaceStore((s) => s.setActiveDesignId);
  const setGenerationError = useWorkspaceStore((s) => s.setGenerationError);
  const setActiveSlide = useWorkspaceStore((s) => s.setActiveSlide);
  const setLastPrompt = useWorkspaceStore((s) => s.setLastPrompt);
  const setLastGenerationMeta = useWorkspaceStore((s) => s.setLastGenerationMeta);
  const activeVersionNumber = useWorkspaceStore((s) => s.activeVersionNumber);
  const activeSlide = useWorkspaceStore((s) => s.activeSlide);
  const versionHistory = useWorkspaceStore((s) => s.versionHistory);

  // Mount keyboard shortcuts globally
  useWorkspaceKeyboardShortcuts();
  useDeferredProjectAssignment();

  // ── Load design from URL designId ──────────────────────────────────────
  useEffect(() => {
    if (!designId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/design/${designId}`);
        const json = await res.json();
        if (!mounted) return;
        if (res.ok && json.success) {
          const design = json.data;
          const versions: any[] = design.versions ?? [];
          setVersionHistory(versions);
          setActiveDesignId(design.id ?? designId);
          setLastPrompt(design.originalPrompt ?? "");
          setLastGenerationMeta({
            platform: design.platform,
            format: design.format,
            dimensions: (design.dimensions as any) ?? null,
            sectionPlan: Array.isArray((design.parsedIntent as any)?.sectionPlan)
              ? ((design.parsedIntent as any).sectionPlan as string[])
              : null,
          });

          // Honour versionId URL param or fall back to latest
          const targetVersion = versionIdParam
            ? versions.find((v) => v.id === versionIdParam)
            : versions[versions.length - 1];

          if (targetVersion?.htmlContent) {
            setPreviewHtml(targetVersion.htmlContent);
            setActiveVersionNumber(targetVersion.versionNumber ?? null);
          }

          // Honour slide URL param
          if (slideParam != null) {
            const slideIdx = parseInt(slideParam, 10);
            if (!Number.isNaN(slideIdx)) setActiveSlide(slideIdx);
          }
        }
      } catch {
        if (mounted) {
          setGenerationError({ code: "LOAD_FAILED", message: "Failed to load selected design." });
        }
      }
    })();
    return () => { mounted = false; };
  }, [
    designId,
    versionIdParam,
    slideParam,
    setActiveDesignId,
    setActiveVersionNumber,
    setActiveSlide,
    setGenerationError,
    setLastGenerationMeta,
    setLastPrompt,
    setPreviewHtml,
    setVersionHistory,
  ]);

  // ── Sync URL when version changes ──────────────────────────────────────
  useEffect(() => {
    if (!designId || activeVersionNumber == null) return;
    const version = versionHistory.find((v) => v.versionNumber === activeVersionNumber);
    if (!version) return;
    const params = new URLSearchParams({ designId });
    params.set("versionId", version.id);
    if (activeSlide > 0) params.set("slide", String(activeSlide));
    router.replace(`/workspace?${params.toString()}`, { scroll: false });
  }, [activeVersionNumber, activeSlide, designId, router, versionHistory]);

  const layoutCls = useMemo(
    () =>
      "hidden h-[calc(100vh-56px)] w-full overflow-hidden border-t border-[hsl(var(--border))] md:grid md:grid-cols-[minmax(0,30%)_minmax(0,50%)_minmax(0,20%)]",
    []
  );

  return (
    <>
      {/* Mobile layout */}
      <div className="flex h-[calc(100vh-56px)] w-full items-stretch border-t border-[hsl(var(--border))] md:hidden">
        <div className="relative flex-1">
          <WorkspacePreviewPanel layout="mobile" />
          <div className="absolute left-3 top-3 z-30">
            <button
              type="button"
              className="rounded-full bg-[hsl(var(--surface-elevated))]/90 px-3 py-1 text-xs shadow"
              onClick={() => {
                const el = document.getElementById("workspace-mobile-prompt");
                if (el) el.classList.toggle("hidden");
              }}
            >
              Prompt &amp; controls
            </button>
          </div>
          <div
            id="workspace-mobile-prompt"
            className="hidden absolute inset-x-0 bottom-0 z-40 max-h-[70%] rounded-t-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
          >
            <WorkspacePromptPanel layout="mobile" prompt={prompt} setPrompt={setPrompt} />
          </div>
        </div>
        <div className="hidden h-full w-[260px] border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))] sm:block">
          <WorkspaceRightPanel layout="mobile" />
        </div>
      </div>

      {/* Desktop layout */}
      <div className={layoutCls}>
        <div className="min-w-0 overflow-hidden">
          <WorkspacePromptPanel layout="desktop" prompt={prompt} setPrompt={setPrompt} />
        </div>
        <div className="min-w-0 overflow-hidden">
          <WorkspacePreviewPanel layout="desktop" />
        </div>
        <div className="min-w-0 overflow-hidden">
          <WorkspaceRightPanel layout="desktop" />
        </div>
      </div>

      {/* Global overlays */}
      <WorkspaceShortcutsModal />
      <WorkspaceTour designId={designId} />
    </>
  );
}
