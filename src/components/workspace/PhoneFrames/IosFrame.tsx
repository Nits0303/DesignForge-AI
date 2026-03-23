"use client";

import type { ReactNode } from "react";

type Props = {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
};

/**
 * iOS-style device chrome: rounded rect, Dynamic Island cutout, side button, home indicator area.
 * Screen content goes in `children` (typically an iframe) at exact width×height.
 */
export function IosFrame({ width, height, children, className = "" }: Props) {
  const bezel = 14;
  const outerW = width + bezel * 2;
  const outerH = height + bezel * 2 + 8;
  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: outerW, height: outerH }}
    >
      <svg
        width={outerW}
        height={outerH}
        viewBox={`0 0 ${outerW} ${outerH}`}
        className="absolute inset-0 text-[#2c2c2e]"
        aria-hidden
      >
        <defs>
          <filter id="ios-inner-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.35" />
          </filter>
        </defs>
        <rect
          x="2"
          y="2"
          width={outerW - 4}
          height={outerH - 4}
          rx="44"
          ry="44"
          fill="currentColor"
          filter="url(#ios-inner-shadow)"
        />
        <rect
          x={bezel}
          y={bezel + 4}
          width={width}
          height={height}
          rx="36"
          ry="36"
          fill="#0a0a0b"
        />
        {/* Dynamic Island */}
        <rect x={outerW / 2 - 52} y={bezel + 10} width={104} height={28} rx={14} fill="#0a0a0b" />
        {/* Side button */}
        <rect x={outerW - 3} y={outerH * 0.22} width={3} height={56} rx={1} fill="#1c1c1e" />
      </svg>
      <div
        className="absolute overflow-hidden bg-black"
        style={{
          left: bezel,
          top: bezel + 4,
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
