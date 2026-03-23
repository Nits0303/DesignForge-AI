"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store/useUIStore";

type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export function PeriodSelector({
  onChange,
}: {
  onChange?: (p: AnalyticsPeriod) => void;
}) {
  const analyticsPeriod = useUIStore((s) => s.analyticsPeriod);
  const setAnalyticsPeriod = useUIStore((s) => s.setAnalyticsPeriod);

  const periods = useMemo(
    () =>
      [
        { key: "7d", label: "7 days" },
        { key: "30d", label: "30 days" },
        { key: "90d", label: "90 days" },
        { key: "all", label: "All time" },
      ] as const,
    []
  );

  return (
    <div className="flex items-center gap-2">
      {periods.map((p) => {
        const active = analyticsPeriod === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setAnalyticsPeriod(p.key);
              onChange?.(p.key);
            }}
            className={[
              "rounded-[var(--radius)] px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-[hsl(var(--accent-muted-strong))] text-[hsl(var(--text-primary))] border border-[hsl(var(--accent-muted-strong))]"
                : "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-secondary))] border border-[hsl(var(--border-default))] hover:bg-[hsl(var(--bg-elevated))]/80",
            ].join(" ")}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

