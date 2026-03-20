"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";

type Shortcut = {
  keys: string;
  description: string;
};

export const WORKSPACE_SHORTCUTS: Shortcut[] = [
  { keys: "Enter", description: "Generate when prompt focused" },
  { keys: "Cmd/Ctrl+Enter", description: "Generate from anywhere" },
  { keys: "Cmd/Ctrl+Z", description: "Previous version" },
  { keys: "Cmd/Ctrl+Shift+Z", description: "Next version" },
  { keys: "Cmd/Ctrl+K", description: "Focus prompt & select all" },
  { keys: "Cmd/Ctrl+R", description: "Regenerate design (with confirmation)" },
  { keys: "←/→", description: "Previous/next slide" },
  { keys: "1/2/3", description: "Go to slide 1/2/3" },
  { keys: "F", description: "Toggle Fit / Actual" },
  { keys: "D/T/M", description: "Desktop / Tablet / Mobile breakpoint" },
  { keys: "Esc", description: "Close popovers / modals" },
  { keys: "?", description: "Toggle keyboard shortcuts help" },
];

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if ((target as HTMLElement).isContentEditable) return true;
  return false;
}

export function useWorkspaceKeyboardShortcuts() {
  const {
    setPreviewMode,
    previewMode,
    breakpoint,
    setBreakpoint,
    activeSlide,
    setActiveSlide,
    versionHistory,
    activeVersionNumber,
    setActiveVersionNumber,
    setPreviewHtml,
    triggerVersionFlash,
  } = useWorkspaceStore((s) => s);

  const { setActiveModal, showShortcuts, setShowShortcuts } = useUIStore((s) => s);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCmd = e.metaKey || e.ctrlKey;
      const key = e.key;
      const inText = isTextInput(e.target);

      // ── Cmd+Enter: Generate from anywhere ─────────────────────────────────
      if (isCmd && key === "Enter") {
        e.preventDefault();
        const btn = document.getElementById("generate-btn") as HTMLButtonElement | null;
        btn?.click();
        return;
      }

      // ── Cmd+K: focus prompt ────────────────────────────────────────────────
      if (isCmd && key.toLowerCase() === "k") {
        e.preventDefault();
        const ta = document.getElementById("prompt-textarea") as HTMLTextAreaElement | null;
        if (ta) { ta.focus(); ta.select(); }
        return;
      }

      // ── Cmd+Z / Cmd+Shift+Z: version navigation ───────────────────────────
      if (isCmd && key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (activeVersionNumber == null || versionHistory.length === 0) return;
        const sorted = [...versionHistory].sort((a, b) => a.versionNumber - b.versionNumber);
        const idx = sorted.findIndex((v) => v.versionNumber === activeVersionNumber);
        const prev = sorted[idx - 1];
        if (prev) {
          setActiveVersionNumber(prev.versionNumber);
          setPreviewHtml(prev.htmlContent);
          triggerVersionFlash();
        }
        return;
      }
      if (isCmd && key === "z" && e.shiftKey) {
        e.preventDefault();
        if (activeVersionNumber == null || versionHistory.length === 0) return;
        const sorted = [...versionHistory].sort((a, b) => a.versionNumber - b.versionNumber);
        const idx = sorted.findIndex((v) => v.versionNumber === activeVersionNumber);
        const next = sorted[idx + 1];
        if (next) {
          setActiveVersionNumber(next.versionNumber);
          setPreviewHtml(next.htmlContent);
          triggerVersionFlash();
        }
        return;
      }

      // ── Cmd+R: regenerate ─────────────────────────────────────────────────
      if (isCmd && key.toLowerCase() === "r") {
        e.preventDefault();
        if (window.confirm("Regenerate this design from scratch?")) {
          const btn = document.getElementById("regenerate-btn") as HTMLButtonElement | null;
          btn?.click();
        }
        return;
      }

      // Block further non-cmd shortcuts when in a text input
      if (inText) return;

      // ── Esc: close modals / popovers ──────────────────────────────────────
      if (key === "Escape") {
        e.preventDefault();
        setActiveModal("none");
        setShowShortcuts(false);
        return;
      }

      // ── ?: toggle shortcuts modal ─────────────────────────────────────────
      if (key === "?") {
        e.preventDefault();
        setShowShortcuts(!showShortcuts);
        return;
      }

      // ── F: Fit / Actual toggle ────────────────────────────────────────────
      if (!isCmd && key.toLowerCase() === "f") {
        e.preventDefault();
        setPreviewMode(previewMode === "fit" ? "actual" : "fit");
        return;
      }

      // ── Breakpoints ───────────────────────────────────────────────────────
      if (!isCmd) {
        const k = key.toLowerCase();
        if (k === "d") { e.preventDefault(); setBreakpoint("desktop"); return; }
        if (k === "t") { e.preventDefault(); setBreakpoint("tablet"); return; }
        if (k === "m") { e.preventDefault(); setBreakpoint("mobile"); return; }
      }

      // ── Slide navigation ──────────────────────────────────────────────────
      if (!isCmd && key === "ArrowLeft") {
        e.preventDefault();
        setActiveSlide(Math.max(0, activeSlide - 1));
        return;
      }
      if (!isCmd && key === "ArrowRight") {
        e.preventDefault();
        setActiveSlide(activeSlide + 1);
        return;
      }
      if (!isCmd && ["1", "2", "3"].includes(key)) {
        e.preventDefault();
        setActiveSlide(Number(key) - 1);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSlide,
    activeVersionNumber,
    breakpoint,
    previewMode,
    setActiveModal,
    setActiveSlide,
    setActiveVersionNumber,
    setBreakpoint,
    setPreviewHtml,
    setPreviewMode,
    setShowShortcuts,
    showShortcuts,
    triggerVersionFlash,
    versionHistory,
  ]);
}
