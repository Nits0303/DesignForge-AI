"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import { WORKSPACE_SHORTCUTS } from "@/hooks/useWorkspaceKeyboardShortcuts";

export function WorkspaceShortcutsModal() {
  const { showShortcuts, setShowShortcuts } = useUIStore((s) => s);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowShortcuts(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showShortcuts, setShowShortcuts]);

  if (!showShortcuts) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) setShowShortcuts(false);
      }}
    >
      <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={() => setShowShortcuts(false)}
            className="rounded p-1 hover:bg-[hsl(var(--surface))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          {WORKSPACE_SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">{s.description}</span>
              <kbd className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 font-mono text-xs text-[hsl(var(--foreground))]">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[10px] text-[hsl(var(--muted-foreground))]">
          Press <kbd className="rounded border border-[hsl(var(--border))] px-1 font-mono text-[10px]">?</kbd> or{" "}
          <kbd className="rounded border border-[hsl(var(--border))] px-1 font-mono text-[10px]">Esc</kbd> to toggle this panel.
        </p>
      </div>
    </div>
  );
}
