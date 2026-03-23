"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

type SeriesDef = { key: string; label: string; color: string };
type AnnotationDef = { x: string; label: string };

export function LineChart({
  data,
  xKey,
  series,
  referenceLine,
  referenceLines = [],
  annotations = [],
  height = 300,
  loading = false,
  empty = false,
}: {
  data: Array<Record<string, any>>;
  xKey: string;
  series: SeriesDef[];
  referenceLine?: { value: number; color?: string; label?: string };
  referenceLines?: Array<{ value: number; color?: string; label?: string }>;
  annotations?: AnnotationDef[];
  height?: number;
  loading?: boolean;
  empty?: boolean;
}) {
  const fontFamily = "var(--font-inter)";
  const mergedReferenceLines = [
    ...(referenceLine ? [referenceLine] : []),
    ...referenceLines,
  ];

  return (
    <div className="relative w-full">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-card)] bg-[hsl(var(--surface-elevated))]/70 backdrop-blur-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--accent))]" />
        </div>
      ) : null}

      {!loading && empty ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text-secondary))]">
          No data for the selected period.
        </div>
      ) : null}

      {!empty && !loading ? (
        <ResponsiveContainer width="100%" height={height}>
          <ReLineChart data={data} margin={{ top: 16, right: 8, left: 8, bottom: 28 }}>
            <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
            <XAxis dataKey={xKey as any} tick={{ fill: "var(--text-secondary)", style: { fontFamily } }} tickMargin={8} />
            <YAxis tick={{ fill: "var(--text-secondary)", style: { fontFamily } }} />
            <Tooltip
              wrapperStyle={{ fontFamily }}
              contentStyle={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius)",
              }}
              labelStyle={{ color: "var(--text-primary)", fontFamily }}
              itemStyle={{ color: "var(--text-primary)", fontFamily }}
            />

            {mergedReferenceLines.map((rl, idx) => (
              <ReferenceLine
                key={`${rl.value}-${idx}`}
                y={rl.value}
                stroke={rl.color ?? "var(--border-default)"}
                strokeDasharray="4 4"
                label={rl.label ? { position: "right", fill: "var(--text-secondary)", style: { fontFamily } } : undefined}
              />
            ))}

            {annotations.map((a, idx) => (
              <ReferenceLine
                key={`${a.x}-${idx}`}
                x={a.x}
                stroke="var(--accent-subtle)"
                strokeDasharray="4 4"
                label={{ value: a.label, position: "top", fill: "var(--text-secondary)", style: { fontFamily } }}
              />
            ))}

            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                dot={false}
                isAnimationActive
              />
            ))}
          </ReLineChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

