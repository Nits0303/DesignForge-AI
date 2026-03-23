"use client";

import type { ReactNode } from "react";

type Props = {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
};

export function TabletFrame({ width, height, children, className = "" }: Props) {
  const bezel = 24;
  const outerW = width + bezel * 2;
  const outerH = height + bezel * 2;
  return (
    <div className={`relative inline-block ${className}`} style={{ width: outerW, height: outerH }}>
      <svg
        width={outerW}
        height={outerH}
        viewBox={`0 0 ${outerW} ${outerH}`}
        className="absolute inset-0 text-[#2a2a2e]"
        aria-hidden
      >
        <rect x="3" y="3" width={outerW - 6} height={outerH - 6} rx="28" ry="28" fill="currentColor" />
        <rect
          x={bezel}
          y={bezel}
          width={width}
          height={height}
          rx="20"
          ry="20"
          fill="#0a0a0b"
        />
        <circle cx={outerW / 2} cy={bezel + 14} r={4} fill="#0a0a0b" />
      </svg>
      <div
        className="absolute overflow-hidden bg-black"
        style={{
          left: bezel,
          top: bezel,
          width,
          height,
          borderRadius: 18,
        }}
      >
        {children}
      </div>
    </div>
  );
}
