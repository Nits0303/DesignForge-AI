"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DesignCard } from "@/components/design/DesignCard";
import { Button } from "@/components/ui/button";

const PLATFORM_CHIPS = [
  "all",
  "instagram",
  "linkedin",
  "facebook",
  "twitter",
  "website",
  "mobile",
  "dashboard",
];

export default function DesignsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [dateRange, setDateRange] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("sort", sort);
      params.set("dateRange", dateRange);
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/designs?${params.toString()}`);
      const json = await res.json();
      if (!mounted) return;
      if (res.ok && json.success) {
        setItems((prev) => (page === 1 ? json.data.items : [...prev, ...json.data.items]));
        setTotal(json.data.total ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [page, platform, search, sort, status, dateRange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting && !loading && items.length < total) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length, loading, total]);

  // Thumbnail polling: if any card is still missing its previewUrl, refresh from /api/designs/recent.
  useEffect(() => {
    if (!items.length) return;
    const anyMissing = items.some((i) => i.previewUrl == null);
    if (!anyMissing) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch("/api/designs/recent");
        const json = await res.json();
        if (!res.ok || !json.success) return;

        const recents: any[] = json.data ?? [];
        setItems((prev) =>
          prev.map((p) => {
            const match = recents.find((r) => r.id === p.id);
            if (!match) return p;
            if (p.previewUrl != null) return p;
            return {
              ...p,
              previewUrl: match.previewUrl,
              brandPrimaryColor: match.brandPrimaryColor,
              promptSnippet: match.promptSnippet,
            };
          })
        );
      } catch {
        // best effort
      }
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [items]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  const empty = items.length === 0;

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
            }}
            placeholder="Search title or prompt..."
            className="h-9 min-w-[220px] flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 text-sm"
          />
          <select
            className="h-9 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="all">All status</option>
            <option value="preview">Preview</option>
            <option value="approved">Approved</option>
            <option value="exported">Exported</option>
            <option value="archived">Archived</option>
          </select>
          <select
            className="h-9 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 text-sm"
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value);
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_revised">Most revised</option>
          </select>
          <select
            className="h-9 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 text-sm"
            value={dateRange}
            onChange={(e) => {
              setPage(1);
              setDateRange(e.target.value);
            }}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORM_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setPage(1);
                setPlatform(chip);
              }}
              className={`rounded-full px-3 py-1 text-xs ${
                platform === chip
                  ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--accent))]"
                  : "bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-8 text-center">
          <div className="text-base font-semibold">No designs found</div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Try changing your filters or search query.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-[hsl(var(--accent))]"
            onClick={() => {
              setPage(1);
              setSearchInput("");
              setSearch("");
              setPlatform("all");
              setStatus("all");
              setSort("newest");
              setDateRange("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((d) => (
            <div key={d.id} className="relative">
              <label className="absolute left-2 top-2 z-10">
                <input
                  type="checkbox"
                  checked={!!selected[d.id]}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [d.id]: e.target.checked }))
                  }
                />
              </label>
              <DesignCard design={d} />
            </div>
          ))}
        </div>
      )}

      <div ref={endRef} className="h-6" />
      {loading ? (
        <div className="text-center text-xs text-[hsl(var(--muted-foreground))]">Loading…</div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(720px,92vw)] -translate-x-1/2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{selectedIds.length}</span> selected
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await Promise.all(
                    selectedIds.map((id) =>
                      fetch(`/api/design/${id}`, { method: "DELETE" })
                    )
                  );
                  setSelected({});
                  setPage(1);
                }}
              >
                Archive selected
              </Button>
              <Button size="sm" variant="ghost" disabled>
                Export selected
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

