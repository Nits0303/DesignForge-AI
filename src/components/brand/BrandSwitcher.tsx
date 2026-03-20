"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrandStore } from "@/store/useBrandStore";
import type { BrandProfile } from "@/types/brand";

const ACTIVE_BRAND_KEY = "df:active_brand_id";

function getInitials(name?: string | null) {
  const n = (name ?? "").trim();
  if (!n) return "?";
  return n.slice(0, 1).toUpperCase();
}

export function BrandSwitcher() {
  const pathname = usePathname();
  const { brands, activeBrandId, setBrands, setActiveBrandId } = useBrandStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_BRAND_KEY);
      if (saved) setActiveBrandId(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (activeBrandId) localStorage.setItem(ACTIVE_BRAND_KEY, activeBrandId);
      else localStorage.removeItem(ACTIVE_BRAND_KEY);
    } catch {}
  }, [activeBrandId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/brands");
        const json = await res.json();
        if (!cancelled && res.ok && json.success) {
          setBrands(json.data);
          if (!activeBrandId && json.data?.length) {
            const def = (json.data as BrandProfile[]).find((b) => b.isDefault);
            setActiveBrandId(def?.id ?? json.data[0].id);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(
    () => brands.find((b) => b.id === activeBrandId) ?? brands.find((b) => b.isDefault) ?? brands[0],
    [brands, activeBrandId]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm hover:bg-[hsl(var(--surface-elevated))]/80"
      >
        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--border))] text-xs font-semibold text-[hsl(var(--foreground))]">
          {active?.logoPrimaryUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.logoPrimaryUrl} alt="logo" className="h-6 w-6 object-cover" />
          ) : (
            getInitials(active?.name)
          )}
        </span>
        <span className="max-w-[160px] truncate">
          {loading ? "Loading brands..." : active?.name ?? "No brand"}
        </span>
        <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
      </button>

      {open ? (
        <div className="absolute left-0 top-11 z-50 w-[360px] rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-2">
          <div className="max-h-[320px] overflow-auto">
            {brands.length === 0 ? (
              <div className="p-3 text-sm text-[hsl(var(--muted-foreground))]">
                No brands yet.{" "}
                <Link className="font-semibold text-[hsl(var(--accent))]" href="/brands/new">
                  Create your first brand
                </Link>
                .
              </div>
            ) : (
              brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setActiveBrandId(b.id);
                    setOpen(false);
                  }}
                  className={`w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm transition-colors ${
                    b.id === active?.id
                      ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
                      : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent-muted))]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--border))] text-xs font-semibold">
                      {b.logoPrimaryUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logoPrimaryUrl} alt="logo" className="h-6 w-6 object-cover" />
                      ) : (
                        getInitials(b.name)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{b.name}</div>
                      <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {b.industry ?? "—"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {b.colors
                        ? (["primary", "secondary", "accent"] as const).map((k) => (
                            <span
                              key={k}
                              className="h-2.5 w-2.5 rounded-full border border-[hsl(var(--border))]"
                              style={{ background: (b.colors as any)[k] }}
                            />
                          ))
                        : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="mt-2 flex gap-2 border-t border-[hsl(var(--border))] pt-2">
            <Link className="flex-1" href="/brands" onClick={() => setOpen(false)}>
              <Button variant="secondary" className="w-full">
                <Settings2 className="mr-2 h-4 w-4" />
                Manage Brands
              </Button>
            </Link>
            <Link className="flex-1" href="/brands/new" onClick={() => setOpen(false)}>
              <Button className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                New Brand
              </Button>
            </Link>
          </div>
          <div className="mt-2 text-xs text-[hsl(var(--subtle-foreground))]">
            {pathname}
          </div>
        </div>
      ) : null}
    </div>
  );
}

