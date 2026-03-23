"use client";

import React from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

export function MiniSparkline<T extends Record<string, any>>({
  data,
  valueKey,
  color,
  width = 80,
  height = 32,
}: {
  data: T[];
  valueKey: keyof T & string;
  color: string;
  width?: number;
  height?: number;
}) {
  const fontFamily = "var(--font-inter)";

  return (
    <div className="w-full">
      <ResponsiveContainer width={width} height={height}>
        <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <Line
            type="monotone"
            dataKey={valueKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive
          />
          {/* Explicitly hide all text/axes by not rendering them. */}
          <text style={{ fontFamily }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

