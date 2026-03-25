"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";
import { getFirstVisibleElementByIds } from "@/lib/dom/visibleElement";
import { SOCIAL_DIMENSIONS } from "@/constants/platforms";

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
  { keys: "Shift+1/2/3", description: "Square / Portrait / Landscape canvas" },
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
  // Subscribe once; read latest state inside handlers to avoid dependency-array shape changes
  // (and to keep keyboard shortcuts stable through streaming updates / Fast Refresh).
  useWorkspaceStore(() => null);
  useUIStore(() => null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ws = useWorkspaceStore.getState();
      const ui = useUIStore.getState();

      const isCmd = e.metaKey || e.ctrlKey;
      const key = e.key;
      const inText = isTextInput(e.target);

      // ── Cmd+Enter: Generate from anywhere ─────────────────────────────────
      if (isCmd && key === "Enter") {
        e.preventDefault();
        const btn = getFirstVisibleElementByIds(["generate-btn", "generate-btn-mobile"]) as HTMLButtonElement | null;
        btn?.click();
        return;
      }

      // ── Cmd+K: focus prompt ────────────────────────────────────────────────
      if (isCmd && key.toLowerCase() === "k") {
        e.preventDefault();
        const ta = getFirstVisibleElementByIds([
          "workspace-prompt-input",
          "workspace-prompt-input-mobile",
        ]) as HTMLTextAreaElement | null;
        if (ta) {
          ta.focus();
          ta.select();
        }
        return;
      }

      // ── Cmd+Z / Cmd+Shift+Z: version navigation ───────────────────────────
      if (isCmd && key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (ws.activeVersionNumber == null || ws.versionHistory.length === 0) return;
        const sorted = [...ws.versionHistory].sort((a, b) => a.versionNumber - b.versionNumber);
        const idx = sorted.findIndex((v) => v.versionNumber === ws.activeVersionNumber);
        const prev = sorted[idx - 1];
        if (prev) {
          ws.setActiveVersionNumber(prev.versionNumber);
          ws.setPreviewHtml(prev.htmlContent);
          ws.triggerVersionFlash();
        }
        return;
      }
      if (isCmd && key === "z" && e.shiftKey) {
        e.preventDefault();
        if (ws.activeVersionNumber == null || ws.versionHistory.length === 0) return;
        const sorted = [...ws.versionHistory].sort((a, b) => a.versionNumber - b.versionNumber);
        const idx = sorted.findIndex((v) => v.versionNumber === ws.activeVersionNumber);
        const next = sorted[idx + 1];
        if (next) {
          ws.setActiveVersionNumber(next.versionNumber);
          ws.setPreviewHtml(next.htmlContent);
          ws.triggerVersionFlash();
        }
        return;
      }

      // ── Cmd+R: regenerate ─────────────────────────────────────────────────
      if (isCmd && key.toLowerCase() === "r") {
        e.preventDefault();
        if (window.confirm("Regenerate this design from scratch?")) {
          const btn = getFirstVisibleElementByIds([
            "regenerate-btn",
            "regenerate-btn-mobile",
          ]) as HTMLButtonElement | null;
          btn?.click();
        }
        return;
      }

      // Block further non-cmd shortcuts when in a text input
      if (inText) return;

      // ── Shift+1/2/3: dimension switching ──────────────────────────────────
      if (e.shiftKey && ["1", "2", "3"].includes(key)) {
        const locked =
          ws.generationState !== "idle" ||
          Boolean(ws.activeDesignId && (ws.previewHtml ?? "").trim().length > 0);
        if (locked) return;
        e.preventDefault();
        const idx = Number(key) - 1;
        const d = SOCIAL_DIMENSIONS[idx];
        if (d) ws.setSelectedDimension(d as any);
        return;
      }

      // ── Esc: close modals / popovers ──────────────────────────────────────
      if (key === "Escape") {
        e.preventDefault();
        ui.setActiveModal("none");
        ui.setShowShortcuts(false);
        return;
      }

      // ── ?: toggle shortcuts modal ─────────────────────────────────────────
      if (key === "?") {
        e.preventDefault();
        ui.setShowShortcuts(!ui.showShortcuts);
        return;
      }

      // ── F: Fit / Actual toggle ────────────────────────────────────────────
      if (!isCmd && key.toLowerCase() === "f") {
        e.preventDefault();
        ws.setPreviewMode(ws.previewMode === "fit" ? "actual" : "fit");
        return;
      }

      // ── Breakpoints ───────────────────────────────────────────────────────
      if (!isCmd) {
        const k = key.toLowerCase();
        if (k === "d") { e.preventDefault(); ws.setBreakpoint("desktop"); return; }
        if (k === "t") { e.preventDefault(); ws.setBreakpoint("tablet"); return; }
        if (k === "m") { e.preventDefault(); ws.setBreakpoint("mobile"); return; }
      }

      // ── Slide navigation ──────────────────────────────────────────────────
      if (!isCmd && key === "ArrowLeft") {
        e.preventDefault();
        ws.setActiveSlide(Math.max(0, ws.activeSlide - 1));
        return;
      }
      if (!isCmd && key === "ArrowRight") {
        e.preventDefault();
        ws.setActiveSlide(ws.activeSlide + 1);
        return;
      }
      if (!isCmd && ["1", "2", "3"].includes(key)) {
        e.preventDefault();
        ws.setActiveSlide(Number(key) - 1);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
