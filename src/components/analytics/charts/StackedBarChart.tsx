"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Series = { key: string; label: string; color: string };

export function StackedBarChart({
  data,
  xKey,
  series,
  height = 300,
  loading = false,
  empty = false,
}: {
  data: Array<Record<string, any>>;
  xKey: string;
  series: Series[];
  height?: number;
  loading?: boolean;
  empty?: boolean;
}) {
  const fontFamily = "var(--font-inter)";

  return (
    <div className="relative w-full">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-card)] bg-[hsl(var(--surface-elevated))]/70 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--accent))]" />
          </div>
        </div>
      ) : null}

      {!loading && empty ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text-secondary))]">
          No data for the selected period.
        </div>
      ) : null}

      {!empty && !loading ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 16, right: 8, left: 8, bottom: 28 }}>
            <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
            <XAxis
              dataKey={xKey as any}
              tick={{ fill: "var(--text-secondary)", style: { fontFamily } }}
              tickMargin={8}
              minTickGap={20}
            />
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
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId="a" isAnimationActive />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

