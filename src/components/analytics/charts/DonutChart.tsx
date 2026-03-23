"use client";

import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Cell,
} from "recharts";

export function DonutChart({
  data,
  innerRadius = 60,
  centerLabel,
  onSegmentClick,
  height = 300,
  loading = false,
  empty = false,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  innerRadius?: number;
  centerLabel?: { top: string; bottom?: string };
  onSegmentClick?: (name: string) => void;
  height?: number;
  loading?: boolean;
  empty?: boolean;
}) {
  const fontFamily = "var(--font-inter)";
  const total = data.reduce((a, x) => a + (x.value ?? 0), 0);

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
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Tooltip
                wrapperStyle={{ fontFamily }}
                contentStyle={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: any, name: any) => [value, name]}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={innerRadius}
                outerRadius={Math.max(90, innerRadius + 40)}
                paddingAngle={2}
                onClick={(d: any) => onSegmentClick?.(d?.name)}
                isAnimationActive
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              {centerLabel ? (
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="var(--text-secondary)" style={{ fontFamily }}>
                  {total ? (
                    <>
                      <tspan x="50%" dy="-0.2em" fontSize="20" fill="var(--text-primary)">
                        {centerLabel.top}
                      </tspan>
                      {centerLabel.bottom ? (
                        <tspan x="50%" dy="1.3em" fontSize="12" fill="var(--text-secondary)">
                          {centerLabel.bottom}
                        </tspan>
                      ) : null}
                    </>
                  ) : null}
                </text>
              ) : null}
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

