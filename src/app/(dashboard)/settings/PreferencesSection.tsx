"use client";

import { useEffect, useMemo, useState } from "react";
import { PREFERENCE_LABELS } from "@/constants/preferenceLabels";
import { Button } from "@/components/ui/button";

const LEARNED_KEYS = new Set([
  "default_background",
  "headline_size_modifier",
  "layout_density",
  "always_include_cta",
  "color_temperature",
  "preferred_heading_font",
]);

type PrefRow = {
  id: string;
  userId: string;
  preferenceKey: string;
  preferenceValue: any;
  confidence: number | null;
  sampleCount: number;
  manualOverride: boolean;
  label?: string;
};

function confidenceTier(conf: number) {
  if (conf < 0.7) return { label: "Learning", tone: "text-[hsl(var(--muted-foreground))]" };
  if (conf < 0.85) return { label: "Confident", tone: "text-yellow-200" };
  return { label: "Strong", tone: "text-[hsl(var(--accent))]" };
}

function formatInferredValue(key: string, value: any): string {
  switch (key) {
    case "default_background":
      return value === "light" ? "Light" : "Dark";
    case "headline_size_modifier": {
      const scale = typeof value === "object" && value ? value.scale : value;
      const s = typeof scale === "number" ? scale : Number(scale);
      if (Number.isFinite(s)) {
        const pct = Math.round((s - 1) * 100);
        const sign = pct >= 0 ? "+" : "";
        return `${s.toFixed(2)}x (${sign}${pct}%)`;
      }
      return String(value ?? "");
    }
    case "layout_density":
      return value === "compact" ? "Compact" : "Spacious";
    case "always_include_cta":
      return value ? "Always" : "Optional";
    case "color_temperature":
      return value === "cool" ? "Cool" : "Warm";
    case "preferred_heading_font":
      return value?.fontName ? String(value.fontName) : "—";
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

export default function PreferencesSection({
  userId,
  totalDesigns,
  totalRevisions,
}: {
  userId: string;
  totalDesigns: number;
  totalRevisions: number;
}) {
  const [prefs, setPrefs] = useState<PrefRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const learnedPrefs = useMemo(() => (prefs ? prefs.filter((p) => LEARNED_KEYS.has(p.preferenceKey)) : []), [prefs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences");
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) setPrefs(json.data);
        else setPrefs([]);
      } catch {
        if (!cancelled) setPrefs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const needsEmptyState = totalDesigns < 5;

  const refresh = async () => {
    const res = await fetch("/api/preferences");
    const json = await res.json();
    if (json?.success && Array.isArray(json.data)) setPrefs(json.data);
  };

  const setManualOverride = async (key: string, preferenceValue: any) => {
    await fetch(`/api/preferences/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferenceValue }),
    });
    await refresh();
  };

  const resetKeyToLearned = async (key: string) => {
    await fetch(`/api/preferences/${encodeURIComponent(key)}`, { method: "DELETE" });
    await refresh();
  };

  const resetAll = async () => {
    const ok = window.confirm("Reset learned preferences? Manual overrides will be kept.");
    if (!ok) return;
    await fetch("/api/preferences", { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">Learned from your design sessions</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            DesignForge AI learns your style preferences over time by analysing your revision patterns. The more you use it, the more accurately it predicts your preferences.
          </div>
          <div className="pt-2 text-xs text-[hsl(var(--muted-foreground))]">
            Based on {totalDesigns} designs and {totalRevisions} revisions
          </div>
        </div>
      </div>

      {needsEmptyState ? (
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
          <div className="text-sm font-semibold">Your preferences will appear here.</div>
          <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            DesignForge learns from your revision patterns to pre-apply your style automatically.
          </div>
          <div className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            {totalDesigns} of 5 designs created
          </div>
        </div>
      ) : (
        <>
          {loading ? null : learnedPrefs.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
              <div className="text-sm font-semibold">No learned preferences yet.</div>
              <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Create more designs and approve/revise them for the learning engine to start inferring preferences.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {learnedPrefs.map((p) => {
                const conf = p.confidence ?? 0;
                const tier = confidenceTier(conf);
                const pct = clamp(((conf - 0.6) / (0.95 - 0.6)) * 100, 0, 100);

                return (
                  <div key={p.id} className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {p.label ?? PREFERENCE_LABELS[p.preferenceKey] ?? p.preferenceKey}
                        </div>
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                          Current: <span className="text-[hsl(var(--foreground))]">{formatInferredValue(p.preferenceKey, p.preferenceValue)}</span>
                        </div>
                      </div>
                      {p.manualOverride ? (
                        <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1 text-[10px] font-medium">
                          Manual override
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className={`text-xs ${tier.tone}`}>{tier.label}</div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                        <div className="h-full bg-[hsl(var(--accent))]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        Based on {p.sampleCount} design sessions
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {p.preferenceKey === "default_background" ? (
                        <select
                          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                          value={String(p.preferenceValue ?? "dark")}
                          onChange={(e) => setManualOverride(p.preferenceKey, e.target.value)}
                        >
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                      ) : null}

                      {p.preferenceKey === "layout_density" ? (
                        <select
                          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                          value={String(p.preferenceValue ?? "spacious")}
                          onChange={(e) => setManualOverride(p.preferenceKey, e.target.value)}
                        >
                          <option value="spacious">Spacious</option>
                          <option value="compact">Compact</option>
                        </select>
                      ) : null}

                      {p.preferenceKey === "color_temperature" ? (
                        <select
                          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                          value={String(p.preferenceValue ?? "warm")}
                          onChange={(e) => setManualOverride(p.preferenceKey, e.target.value)}
                        >
                          <option value="warm">Warm</option>
                          <option value="cool">Cool</option>
                        </select>
                      ) : null}

                      {p.preferenceKey === "always_include_cta" ? (
                        <select
                          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                          value={p.preferenceValue ? "true" : "false"}
                          onChange={(e) => setManualOverride(p.preferenceKey, e.target.value === "true")}
                        >
                          <option value="true">Always include CTA</option>
                          <option value="false">Optional CTA</option>
                        </select>
                      ) : null}

                      {p.preferenceKey === "headline_size_modifier" ? (
                        <select
                          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                          value={String(p.preferenceValue?.scale ?? 1.2)}
                          onChange={(e) => setManualOverride(p.preferenceKey, { scale: Number(e.target.value) })}
                        >
                          <option value="0.85">Smaller (0.85x)</option>
                          <option value="1.0">Default (1.00x)</option>
                          <option value="1.2">Larger (1.20x)</option>
                          <option value="1.35">Extra Larger (1.35x)</option>
                        </select>
                      ) : null}

                      {p.preferenceKey === "preferred_heading_font" ? (
                        <input
                          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                          value={p.preferenceValue?.fontName ?? ""}
                          placeholder="Font name (e.g. Inter)"
                          onChange={(e) => setManualOverride(p.preferenceKey, { fontName: e.target.value })}
                        />
                      ) : null}
                    </div>

                    {p.manualOverride ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] underline"
                          onClick={() => resetKeyToLearned(p.preferenceKey)}
                        >
                          Reset to learned
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/5 p-5">
            <div className="text-sm font-semibold text-red-200">Reset all preferences</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Clears learned preferences for this account. Manual overrides are kept.
            </div>
            <div className="mt-3">
              <Button variant="secondary" className="border-red-400/50 bg-transparent hover:bg-red-500/10" onClick={resetAll}>
                Reset all preferences
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

