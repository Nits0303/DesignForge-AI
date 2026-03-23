"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  onInsertHint?: (hint: { templateId: string; templateName: string; tags: string[]; category: string }) => void;
};

function buildTemplatePreviewSrcDoc(snippet: string, mode: "card" | "modal" = "modal"): string {
  const source = (snippet ?? "").trim();
  if (!source) return "<!doctype html><html><body></body></html>";
  const isCardMode = mode === "card";

  const resetAndVars = `<style>
html, body { margin:0; padding:0; background:#ffffff; color:#0f172a; }
* { box-sizing:border-box; }
:root {
  --accent: 245 83% 66%;
  --accent-foreground: 0 0% 100%;
  --accent-hover: 245 83% 60%;
  --border: 220 20% 85%;
  --border-accent: 245 83% 66%;
  --background: 220 35% 98%;
  --surface: 0 0% 100%;
  --surface-elevated: 220 20% 96%;
  --foreground: 224 35% 12%;
  --muted-foreground: 220 15% 45%;
  --success: 142 72% 29%;
}
body {
  overflow:${isCardMode ? "hidden" : "auto"};
  ${isCardMode ? "display:flex;align-items:center;justify-content:center;" : ""}
}
#preview-stage {
  ${isCardMode ? "width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;" : "display:block;"}
}
</style>`;

  const suppressTailwindWarning = `<script>
(function(){
  try {
    var p = /cdn\\.tailwindcss\\.com should not be used in production/i;
    var w = console.warn ? console.warn.bind(console) : null;
    if (w) {
      console.warn = function() {
        try {
          var m = arguments && arguments[0] != null ? String(arguments[0]) : "";
          if (p.test(m)) return;
        } catch(_) {}
        return w.apply(console, arguments);
      };
    }
  } catch(_) {}
})();
</script>`;

  const fitCardScript = isCardMode
    ? `<script>
(function(){
  function fit() {
    try {
      var stage = document.getElementById("preview-stage");
      if (!stage) return;
      var root = stage.firstElementChild;
      if (!root) return;
      root.style.transform = "";
      root.style.transformOrigin = "center center";
      var sw = root.scrollWidth || root.clientWidth || 1;
      var sh = root.scrollHeight || root.clientHeight || 1;
      var vw = window.innerWidth || 1;
      var vh = window.innerHeight || 1;
      var scale = Math.min(vw / sw, vh / sh, 1);
      root.style.transform = "scale(" + scale + ")";
    } catch(_) {}
  }
  window.addEventListener("load", fit);
  window.addEventListener("resize", fit);
  setTimeout(fit, 0);
  setTimeout(fit, 120);
})();
</script>`
    : "";

  if (/<html[\s>]/i.test(source) && /<body[\s>]/i.test(source)) {
    let out = source;
    if (/<head[^>]*>/i.test(out)) {
      out = out.replace(
        /<head([^>]*)>/i,
        `<head$1>${resetAndVars}${suppressTailwindWarning}<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>${fitCardScript}`
      );
    } else {
      out = out.replace(
        /<html([^>]*)>/i,
        `<html$1><head>${resetAndVars}${suppressTailwindWarning}<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>${fitCardScript}</head>`
      );
    }
    if (!/<div id="preview-stage">/i.test(out)) {
      out = out.replace(/<body([^>]*)>([\s\S]*?)<\/body>/i, `<body$1><div id="preview-stage">$2</div></body>`);
    }
    return out;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${resetAndVars}${suppressTailwindWarning}<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>${fitCardScript}</head><body><div id="preview-stage">${source}</div></body></html>`;
}

export function TemplateBrowser({ onInsertHint }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>(["all"]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);
  const [libraryInstalled, setLibraryInstalled] = useState<Template[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(true);

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
    (async () => {
      try {
        const res = await fetch("/api/templates/my-library?activeOnly=true");
        const json = await res.json();
        if (json.success && json.data?.installations) {
          const installed = (json.data.installations as { template: Template }[]).map((r) => r.template);
          const installedUnique = Array.from(new Map(installed.map((t) => [t.id, t])).values());
          setLibraryInstalled(installedUnique);
          setLibraryOpen(installedUnique.length <= 10);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

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

  const installedIds = new Set(libraryInstalled.map((t) => t.id));
  const items = Array.from(new Map((data?.items ?? []).map((t) => [t.id, t])).values()).filter(
    (t) => !installedIds.has(t.id)
  );

  return (
    <div className="flex h-full flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      <div className="border-b border-[hsl(var(--border))] px-3 py-2">
        <div className="flex flex-col gap-2">
          <Link
            href="/templates/contribute"
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1.5 text-center text-[11px] font-medium text-[hsl(var(--accent))] hover:bg-[hsl(var(--background))]"
          >
            Contribute template
          </Link>
          <Link
            href="/templates/my-library"
            className="text-center text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            My library →
          </Link>
        </div>
      </div>
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
        {libraryInstalled.length > 0 ? (
          <div className="mb-4">
            <button
              type="button"
              className="mb-2 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"
              onClick={() => setLibraryOpen((o) => !o)}
            >
              My library ({libraryInstalled.length})
              <span>{libraryOpen ? "−" : "+"}</span>
            </button>
            {libraryOpen ? (
              <div className="grid grid-cols-2 gap-2">
                {libraryInstalled.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelected(tpl)}
                    className="group flex flex-col rounded-md border border-[hsl(var(--accent))]/40 bg-[hsl(var(--surface-elevated))] p-2 text-left"
                  >
                    <div className="mb-2 flex h-16 items-center justify-center rounded-sm bg-[hsl(var(--background))] text-[10px] text-[hsl(var(--muted-foreground))]">
                      {tpl.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tpl.previewUrl}
                          alt={tpl.name}
                          className="h-16 w-full rounded-sm object-cover"
                        />
                      ) : tpl.htmlSnippet ? (
                        <iframe
                          title={tpl.name}
                          srcDoc={buildTemplatePreviewSrcDoc(tpl.htmlSnippet, "card")}
                          className="h-16 w-full rounded-sm border-0 bg-white"
                        />
                      ) : (
                        <span>{tpl.category}</span>
                      )}
                    </div>
                    <div className="line-clamp-1 text-[11px] font-medium text-[hsl(var(--foreground))]">
                      {tpl.name}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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
                ) : tpl.htmlSnippet ? (
                  <iframe
                    title={tpl.name}
                    srcDoc={buildTemplatePreviewSrcDoc(tpl.htmlSnippet, "card")}
                    className="h-16 w-full rounded-sm border-0 bg-white"
                  />
                ) : (
                  <span>{tpl.category}</span>
                )}
              </div>
              <div className="line-clamp-1 text-[11px] font-medium text-[hsl(var(--foreground))]">
                {tpl.name}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {tpl.tags.slice(0, 4).map((tag, idx) => (
                  <span
                    key={`${tpl.id}-${tag}-${idx}`}
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
        <DialogContent className="w-[92vw] max-w-[92vw] h-[88vh] max-h-[88vh] border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          {selected && (
            <div className="flex h-full flex-col space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <DialogTitle className="text-base">{selected.name}</DialogTitle>
                  <DialogDescription>
                    {selected.category} • {selected.platform} • {selected.source ?? "custom"}
                  </DialogDescription>
                </div>
                <div className="shrink-0 rounded-full bg-[hsl(var(--background))] px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                  {Math.round((selected.avgApprovalRate ?? 0.5) * 100)}% approval
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {selected.tags.map((tag, idx) => (
                  <span
                    key={`${selected.id}-${tag}-${idx}`}
                    className="rounded-full bg-[hsl(var(--surface-elevated))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                {selected.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.previewUrl}
                    alt={selected.name}
                    className="h-full w-full object-contain"
                  />
                ) : selected.htmlSnippet ? (
                  <iframe
                    title={selected.name}
                    srcDoc={buildTemplatePreviewSrcDoc(selected.htmlSnippet, "modal")}
                    className="h-full w-full border-0 bg-white"
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
                        templateName: selected.name,
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

