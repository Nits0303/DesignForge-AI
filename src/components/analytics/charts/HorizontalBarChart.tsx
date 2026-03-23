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
} from "recharts";

export function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  color,
  height = 260,
  loading = false,
  empty = false,
  maxValue,
}: {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  color: string;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  maxValue?: number;
}) {
  const fontFamily = "var(--font-inter)";
  const computedMaxValue =
    maxValue ?? Math.max(0, ...data.map((d) => Number(d[valueKey] ?? 0)));

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
          <BarChart data={data} layout="vertical" margin={{ top: 12, right: 8, left: 8, bottom: 12 }}>
            <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, computedMaxValue || 1]}
              tick={{ fill: "var(--text-secondary)", style: { fontFamily } }}
            />
            <YAxis
              dataKey={labelKey as any}
              type="category"
              tick={{ fill: "var(--text-secondary)", style: { fontFamily } }}
              width={180}
            />
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
            <Bar dataKey={valueKey as any} fill={color} />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

