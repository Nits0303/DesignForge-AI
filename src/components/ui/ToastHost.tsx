"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/useUIStore";

/**
 * Renders queued toasts from useUIStore (bottom-right, auto-dismiss per toast).
 */
export function ToastHost() {
  const toastQueue = useUIStore((s) => s.toastQueue);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex max-w-sm flex-col gap-2">
      {toastQueue.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
}: {
  toast: { id: string; title: string; description?: string; type?: string; actionLabel?: string; onAction?: () => void };
}) {
  const removeToast = useUIStore((s) => s.removeToast);

  useEffect(() => {
    const timer = window.setTimeout(() => removeToast(toast.id), 6000);
    return () => window.clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <div
      role="status"
      className="pointer-events-auto rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-4 py-3 text-sm shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[hsl(var(--foreground))]">{toast.title}</div>
          {toast.description ? (
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{toast.description}</div>
          ) : null}
          {toast.actionLabel && toast.onAction ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-[hsl(var(--accent))] underline"
              onClick={() => {
                toast.onAction?.();
                removeToast(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => removeToast(toast.id)}
          className="shrink-0 rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--foreground))]"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
