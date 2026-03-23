"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart as ReAreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

type ReferenceLineDef = { value: number; label?: string; color?: string };
type SeriesDef = { key: string; label: string; color: string; fillOpacity?: number };

export function AreaChart({
  data,
  xKey,
  series,
  referenceLines = [],
  height = 300,
  loading = false,
  empty = false,
}: {
  data: Array<Record<string, any>>;
  xKey: string;
  series: SeriesDef[];
  referenceLines?: ReferenceLineDef[];
  height?: number;
  loading?: boolean;
  empty?: boolean;
}) {
  const fontFamily = "var(--font-inter)";

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
          <ReAreaChart data={data} margin={{ top: 16, right: 8, left: 8, bottom: 28 }}>
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
            <Legend wrapperStyle={{ fontFamily }} />
            {referenceLines.map((rl, idx) => (
              <ReferenceLine
                key={`${rl.value}-${idx}`}
                y={rl.value}
                stroke={rl.color ?? "var(--border-default)"}
                strokeDasharray="4 4"
                label={rl.label ? { position: "right", fill: "var(--text-secondary)", style: { fontFamily } } : undefined}
              />
            ))}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={s.fillOpacity ?? 0.2}
                isAnimationActive
                dot={false}
              />
            ))}
          </ReAreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

