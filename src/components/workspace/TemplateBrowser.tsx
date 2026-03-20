"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  tier: string;
  category: string;
  platform: string;
  tags: string[];
  source: string | null;
  previewUrl: string | null;
  usageCount: number;
  avgApprovalRate: number | null;
  htmlSnippet?: string;
};

type ApiResponse = {
  items: Template[];
  total: number;
  page: number;
  limit: number;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "atomic", label: "Atomic" },
  { key: "section", label: "Sections" },
  { key: "social", label: "Social" },
  { key: "dashboard", label: "Dashboard" },
  { key: "website", label: "Website" },
  { key: "mobile", label: "Mobile" },
];

type Props = {
  onInsertHint?: (hint: { templateId: string; tags: string[]; category: string }) => void;
};

export function TemplateBrowser({ onInsertHint }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>(["all"]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const tierFilter = useMemo(() => {
    if (activeFilters.includes("atomic")) return "atomic";
    if (activeFilters.includes("section")) return "section";
    return undefined;
  }, [activeFilters]);

  const platformFilter = useMemo(() => {
    if (activeFilters.includes("dashboard")) return "dashboard";
    if (activeFilters.includes("website")) return "website";
    if (activeFilters.includes("mobile")) return "mobile";
    if (activeFilters.includes("social")) return "instagram";
    return undefined;
  }, [activeFilters]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        params.set("sort", "usage_count");
        if (tierFilter) params.set("tier", tierFilter);
        if (platformFilter) params.set("platform", platformFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/templates?${params.toString()}`);
        const json = (await res.json()) as { success: boolean; data: ApiResponse };
        if (json.success) setData((prev) =>
          page === 1 ? json.data : { ...json.data, items: [...(prev?.items ?? []), ...json.data.items] }
        );
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, tierFilter, platformFilter, page]);

  const items = data?.items ?? [];

  return (
    <div className="flex h-full flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      <div className="border-b border-[hsl(var(--border))] p-3">
        <div className="flex items-center gap-2 rounded-md bg-[hsl(var(--surface-elevated))] px-2 py-1.5">
          <Search className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            className="h-7 flex-1 bg-transparent text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = activeFilters.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setPage(1);
                  setActiveFilters((prev) =>
                    f.key === "all"
                      ? ["all"]
                      : active
                      ? prev.filter((x) => x !== f.key)
                      : [...prev.filter((x) => x !== "all"), f.key]
                  );
                }}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px]",
                  active
                    ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--accent))]"
                    : "bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {items.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelected(tpl)}
              className="group flex flex-col rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-2 text-left"
            >
              <div className="mb-2 flex h-16 items-center justify-center rounded-sm bg-[hsl(var(--background))] text-[10px] text-[hsl(var(--muted-foreground))]">
                {tpl.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tpl.previewUrl}
                    alt={tpl.name}
                    className="h-16 w-full rounded-sm object-cover"
                  />
                ) : (
                  <span>{tpl.category}</span>
                )}
              </div>
              <div className="line-clamp-1 text-[11px] font-medium text-[hsl(var(--foreground))]">
                {tpl.name}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {tpl.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[hsl(var(--background))] px-1.5 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
        {data && data.items.length < data.total && (
          <div className="mt-3 flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>
              Showing {data.items.length} of {data.total} templates
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Load more
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          {selected && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {selected.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {selected.category} • {selected.platform} •{" "}
                    {selected.source ?? "custom"}
                  </p>
                </div>
                <div className="rounded-full bg-[hsl(var(--background))] px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                  {Math.round((selected.avgApprovalRate ?? 0.5) * 100)}% approval
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {selected.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[hsl(var(--surface-elevated))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="h-64 overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                {selected.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.previewUrl}
                    alt={selected.name}
                    className="h-full w-full object-cover"
                  />
                ) : selected.htmlSnippet ? (
                  <iframe
                    title={selected.name}
                    srcDoc={selected.htmlSnippet}
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
                    Preview pending
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    if (onInsertHint && selected) {
                      onInsertHint({
                        templateId: selected.id,
                        tags: selected.tags,
                        category: selected.category,
                      });
                    }
                    setSelected(null);
                  }}
                >
                  Insert into prompt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

