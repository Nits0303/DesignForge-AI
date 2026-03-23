"use client";

import { useEffect, useRef, useState } from "react";
import { getFirstVisibleElementByIds } from "@/lib/dom/visibleElement";

const TOUR_STEPS = [
  {
    id: "tour-step-1",
    targetId: "workspace-prompt-input",
    title: "1 of 5 · Prompt Input",
    body: "Write your design request here. You can start with shortcodes like /instagram or /website.",
  },
  {
    id: "tour-step-2",
    targetId: "generate-btn",
    title: "2 of 5 · Generate Button",
    body: "Click Generate (or press Cmd/Ctrl+Enter) to create your design using AI.",
  },
  {
    id: "tour-step-3",
    targetId: "template-browser-btn",
    title: "3 of 5 · Template Browser",
    body: "Open template browser to quickly insert proven layout directions into your prompt.",
  },
  {
    id: "tour-step-4",
    targetId: "revision-textarea",
    title: "4 of 5 · Revision Chat",
    body: "Ask for changes here after generation. Each request creates a tracked new version.",
  },
  {
    id: "tour-step-5",
    targetId: "brand-switcher-btn",
    title: "5 of 5 · Brand Selector",
    body: "Switch your active brand here. Workspace and dashboard follow this active brand automatically.",
  },
];

const PREF_KEY = "workspace_tour_completed";
const TOUR_LOCAL_KEY = "df:workspace_tour_completed";

export function WorkspaceTour({ designId }: { designId: string | null }) {
  const [step, setStep] = useState<number | null>(null);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      try {
        const localDone = localStorage.getItem(TOUR_LOCAL_KEY) === "1";
        if (localDone) return;

        const res = await fetch(`/api/preferences?key=${PREF_KEY}`);
        const json = await res.json();
        const pref = json?.data?.preferenceValue;
        const done =
          pref === true ||
          pref?.value === true ||
          json?.data?.preferenceValue === true;
        if (res.ok && json.success && done) {
          localStorage.setItem(TOUR_LOCAL_KEY, "1");
          return;
        }
        // Wait for the UI to paint
        setTimeout(() => setStep(0), 800);
      } catch {
        // On API failure, only show when local flag wasn't set.
        try {
          if (localStorage.getItem(TOUR_LOCAL_KEY) !== "1") setTimeout(() => setStep(0), 800);
        } catch {}
      }
    })();
  }, []);

  useEffect(() => {
    if (step == null) return;
    const current = TOUR_STEPS[step];
    if (!current) return;
    setSpotRect(null);

    // Retry measuring until the target exists. Without this, the overlay can
    // deadlock the UI (backdrop captures clicks) when navigation is fast.
    let attempts = 0;
    let rafId: number | null = null;
    const measure = () => {
      const el = getFirstVisibleElementByIds([current.targetId, `${current.targetId}-mobile`]);
      if (el) {
        setSpotRect(el.getBoundingClientRect());
        return;
      }
      attempts += 1;
      if (attempts >= 30) return; // ~0.5s at 60fps
      rafId = window.requestAnimationFrame(measure);
    };

    rafId = window.requestAnimationFrame(measure);
    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [step]);

  const markComplete = async () => {
    setStep(null);
    try {
      localStorage.setItem(TOUR_LOCAL_KEY, "1");
    } catch {}
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferenceKey: PREF_KEY,
          preferenceValue: { value: true },
        }),
      });
    } catch {
      // ignore
    }
  };

  if (step == null) return null;
  const current = TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-[998] pointer-events-none">
      {/* Dark backdrop */}
      <div
        className={[
          "absolute inset-0 bg-black/60",
          spotRect ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
      />

      {/* Spotlight cutout */}
      {spotRect && (
        <div
          className="absolute z-10 rounded pointer-events-none"
          style={{
            top: spotRect.top - 6,
            left: spotRect.left - 6,
            width: spotRect.width + 12,
            height: spotRect.height + 12,
            boxShadow: "0 0 0 4000px rgba(0,0,0,0.6)",
            background: "transparent",
            border: "2px solid hsl(var(--accent))",
          }}
        />
      )}

      {/* Tooltip (or a safe "Skip tour" fallback when target isn't found yet) */}
      {spotRect ? (
        <div
          className="pointer-events-auto absolute z-20 w-72 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4 shadow-2xl"
          style={{
            top: Math.min(spotRect.bottom + 12, window.innerHeight - 200),
            left: Math.max(
              10,
              Math.min(spotRect.left + spotRect.width / 2 - 144, window.innerWidth - 300)
            ),
          }}
        >
          <div
            className="absolute -top-2 h-3 w-3 rotate-45 border-l border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]"
            style={{
              left: Math.max(12, Math.min(spotRect.left + spotRect.width / 2 - Math.max(10, Math.min(spotRect.left + spotRect.width / 2 - 144, window.innerWidth - 300)) - 6, 260)),
            }}
          />
          <div className="mb-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
            {current.title}
          </div>
          <div className="text-sm text-[hsl(var(--foreground))]">{current.body}</div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={markComplete}
              className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={() => {
                const nextStep = step + 1;
                if (nextStep >= TOUR_STEPS.length) {
                  void markComplete();
                } else {
                  setStep(nextStep);
                }
              }}
              className="rounded bg-[hsl(var(--accent))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              {step + 1 < TOUR_STEPS.length ? "Next →" : "Finish"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={markComplete}
          className="pointer-events-auto absolute right-3 top-3 z-[999] rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-1.5 text-xs font-medium hover:bg-[hsl(var(--surface))]"
        >
          Skip tour
        </button>
      )}
    </div>
  );
}
