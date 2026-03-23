"use client";

import { ResponsiveContainer, ScatterChart as ReScatterChart, Scatter, CartesianGrid, XAxis, YAxis, Tooltip, ZAxis } from "recharts";

export function ScatterChart({
  data,
  xKey,
  yKey,
  sizeKey = "size",
  xLabel,
  yLabel,
  height = 300,
  loading = false,
  empty = false,
}: {
  data: Array<Record<string, any>>;
  xKey: string;
  yKey: string;
  sizeKey?: string;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  loading?: boolean;
  empty?: boolean;
}) {
  return (
    <div className="relative w-full">
      {loading ? <div className="absolute inset-0 z-10 bg-[hsl(var(--surface-elevated))]/70" /> : null}
      {!loading && empty ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text-secondary))]">
          No data for the selected period.
        </div>
      ) : null}
      {!empty && !loading ? (
        <ResponsiveContainer width="100%" height={height}>
          <ReScatterChart>
            <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
            <XAxis type="number" dataKey={xKey} name={xLabel} tick={{ fill: "var(--text-secondary)" }} />
            <YAxis type="number" dataKey={yKey} name={yLabel} tick={{ fill: "var(--text-secondary)" }} />
            <ZAxis dataKey={sizeKey} range={[40, 400]} />
            <Tooltip />
            <Scatter data={data} fill="var(--accent-primary)" />
          </ReScatterChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

