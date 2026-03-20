"use client";

import { useEffect, useRef, useState } from "react";

const TOUR_STEPS = [
  {
    id: "tour-step-1",
    targetId: "workspace-prompt-panel",
    title: "1 of 5 · Prompt & Controls",
    body: "Describe your design here, select a brand profile, and tweak generation settings.",
  },
  {
    id: "tour-step-2",
    targetId: "generate-btn",
    title: "2 of 5 · Generate Button",
    body: "Click Generate (or press Cmd/Ctrl+Enter) to create your design using AI.",
  },
  {
    id: "tour-step-3",
    targetId: "workspace-preview-panel",
    title: "3 of 5 · Live Preview",
    body: "Your design streams here in real time. Use zoom, fit/actual, and breakpoint controls.",
  },
  {
    id: "tour-step-4",
    targetId: "workspace-right-panel",
    title: "4 of 5 · Revision Chat",
    body: "Request changes in plain language. Version history tracks every iteration.",
  },
  {
    id: "tour-step-5",
    targetId: "brand-switcher",
    title: "5 of 5 · Brand Selector",
    body: "Switch brand profiles to regenerate with different colors, fonts, and tone of voice.",
  },
];

const PREF_KEY = "workspace_tour_completed";

export function WorkspaceTour({ designId }: { designId: string | null }) {
  const [step, setStep] = useState<number | null>(null);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/preferences?key=${PREF_KEY}`);
        const json = await res.json();
        if (res.ok && json.success && json.data?.preferenceValue?.value === true) return;
        // Wait for the UI to paint
        setTimeout(() => setStep(0), 800);
      } catch {
        // silently ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (step == null) return;
    const current = TOUR_STEPS[step];
    if (!current) return;
    const el = document.getElementById(current.targetId);
    if (el) setSpotRect(el.getBoundingClientRect());
  }, [step]);

  const markComplete = async () => {
    setStep(null);
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
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" />

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

      {/* Tooltip */}
      {spotRect && (
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
      )}
    </div>
  );
}
