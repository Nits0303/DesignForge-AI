"use client";

type Props = {
  variant: "ios" | "android";
  className?: string;
};

/** Decorative status bar overlay (time + faux signal/battery). */
export function MobileStatusBar({ variant, className = "" }: Props) {
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div
      className={`pointer-events-none flex h-8 w-full items-center justify-between px-3 text-[11px] font-medium text-white/90 ${className}`}
    >
      <span>{time}</span>
      <span className="flex items-center gap-1 opacity-90">
        {variant === "ios" ? (
          <>
            <span aria-hidden>●●●</span>
            <span>Wi‑Fi</span>
            <span className="rounded-sm border border-white/40 px-1">100%</span>
          </>
        ) : (
          <>
            <span>5G</span>
            <span className="rounded-sm border border-white/40 px-1">100%</span>
          </>
        )}
      </span>
    </div>
  );
}
