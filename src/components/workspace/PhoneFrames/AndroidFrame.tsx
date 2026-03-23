"use client";

import type { ReactNode } from "react";

type Props = {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
};

/** Android-style frame: rounded rect, punch-hole camera, thinner bezels, no home pill. */
export function AndroidFrame({ width, height, children, className = "" }: Props) {
  const bezel = 12;
  const outerW = width + bezel * 2;
  const outerH = height + bezel * 2 + 6;
  return (
    <div className={`relative inline-block ${className}`} style={{ width: outerW, height: outerH }}>
      <svg
        width={outerW}
        height={outerH}
        viewBox={`0 0 ${outerW} ${outerH}`}
        className="absolute inset-0 text-[#1e1e22]"
        aria-hidden
      >
        <rect
          x="2"
          y="2"
          width={outerW - 4}
          height={outerH - 4}
          rx="40"
          ry="40"
          fill="currentColor"
        />
        <rect
          x={bezel}
          y={bezel + 3}
          width={width}
          height={height}
          rx="36"
          ry="36"
          fill="#0a0a0b"
        />
        <circle cx={outerW / 2} cy={bezel + 18} r={5} fill="#0a0a0b" />
      </svg>
      <div
        className="absolute overflow-hidden bg-black"
        style={{
          left: bezel,
          top: bezel + 3,
          width,
          height,
          borderRadius: 32,
        }}
      >
        {children}
      </div>
    </div>
  );
}
