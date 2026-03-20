"use client";

import type { BrandProfile } from "@/types/brand";

function initials(name?: string | null) {
  const n = (name ?? "").trim();
  return n ? n[0]!.toUpperCase() : "?";
}

export function BrandPreviewCard({ brand }: { brand: BrandProfile }) {
  const colors = (brand.colors ?? {}) as any;
  const typography = (brand.typography ?? {}) as any;

  const bg = colors.background ?? "#0f172a";
  const text = colors.text ?? "#f8fafc";
  const primary = colors.primary ?? "#6366f1";
  const secondary = colors.secondary ?? "#8b5cf6";
  const accent = colors.accent ?? "#a78bfa";

  return (
    <div className="w-[280px] overflow-hidden rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      <div className="h-10" style={{ background: primary }} />
      <div className="p-4" style={{ background: bg, color: text }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--surface-elevated))] text-sm font-bold">
            {brand.logoPrimaryUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoPrimaryUrl} alt="logo" className="h-10 w-10 object-cover" />
            ) : (
              initials(brand.name)
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{brand.name}</div>
            <div className="truncate text-xs opacity-80">{brand.industry ?? "Brand profile"}</div>
          </div>
        </div>

        <div className="mt-4">
          <div
            className="text-sm font-bold"
            style={{
              fontFamily: typography.headingFont ?? "var(--font-inter)",
              fontWeight: typography.headingWeight ?? 700,
              color: primary,
            }}
          >
            Launch announcement
          </div>
          <p
            className="mt-1 text-xs opacity-90"
            style={{
              fontFamily: typography.bodyFont ?? "var(--font-inter)",
              fontWeight: typography.bodyWeight ?? 400,
              color: text,
            }}
          >
            A small preview of how your brand might look in a social post.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="rounded px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: accent }}
            >
              Get started
            </button>
            <span className="text-xs" style={{ color: secondary }}>
              Learn more
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

