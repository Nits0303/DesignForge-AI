"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";

type MItem = {
  id: string;
  name: string;
  platform: string;
  category: string;
  tags: string[];
  previewUrl: string | null;
  htmlSnippet?: string | null;
  previewImages?: unknown;
  installCount: number;
  avgMarketplaceRating: number | null;
  marketplaceRatingCount: number;
  isMarketplaceFeatured?: boolean;
  contributor: { id: string; name: string | null; email: string | null; avatarUrl: string | null } | null;
};

const PLATFORMS = ["all", "instagram", "linkedin", "facebook", "twitter", "website", "mobile", "dashboard"] as const;

function buildCardPreviewDoc(snippet: string): string {
  const source = (snippet ?? "").trim();
  if (!source) return "<!doctype html><html><body></body></html>";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html,body{margin:0;padding:0;background:#fff;color:#0f172a}
*{box-sizing:border-box}
:root{
  --accent:245 83% 66%;
  --accent-foreground:0 0% 100%;
  --accent-hover:245 83% 60%;
  --border:220 20% 85%;
  --background:220 35% 98%;
  --surface:0 0% 100%;
  --surface-elevated:220 20% 96%;
  --foreground:224 35% 12%;
  --muted-foreground:220 15% 45%;
  --success:142 72% 29%;
}
body{display:flex;align-items:center;justify-content:center;overflow:hidden}
#stage{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
</style>
<script>
(function(){
  try {
    var pat=/cdn\\.tailwindcss\\.com should not be used in production/i;
    var ow=console.warn?console.warn.bind(console):null;
    if(ow){console.warn=function(){try{var m=arguments&&arguments[0]!=null?String(arguments[0]):"";if(pat.test(m))return;}catch(_){}return ow.apply(console,arguments);};}
  } catch(_) {}
  function fit(){
    try{
      var stage=document.getElementById("stage");
      if(!stage||!stage.firstElementChild) return;
      var root=stage.firstElementChild;
      root.style.transform="";
      root.style.transformOrigin="center center";
      var sw=root.scrollWidth||root.clientWidth||1;
      var sh=root.scrollHeight||root.clientHeight||1;
      var vw=window.innerWidth||1;
      var vh=window.innerHeight||1;
      var sc=Math.min(vw/sw,vh/sh,1);
      root.style.transform="scale("+sc+")";
    }catch(_){}
  }
  window.addEventListener("load",fit);
  window.addEventListener("resize",fit);
  setTimeout(fit,0); setTimeout(fit,120);
})();
</script>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
</head><body><div id="stage">${source}</div></body></html>`;
}

export function MarketplacePageClient() {
  const enqueueToast = useUIStore((s) => s.enqueueToast);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<MItem[]>([]);
  const [collections, setCollections] = useState<{ id: string; name: string; templateCount: number; coverImageUrl: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [installedIds, setInstalledIds] = useState<Set<string>>(() => new Set());
  const [installingId, setInstallingId] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/templates/collections");
      const json = await res.json();
      if (json.success) setCollections(json.data.collections ?? []);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/templates/my-library", { credentials: "include" });
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.installations)) {
          const next = new Set<string>(
            (json.data.installations as { templateId: string }[]).map((row) => row.templateId)
          );
          setInstalledIds(next);
        }
      } catch {
        // unsigned-in or network — Install will prompt on click
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "24");
      params.set("sort", sort === "popular" ? "popular" : sort === "rated" ? "rated" : sort === "newest" ? "newest" : "used");
      if (debounced) params.set("search", debounced);
      if (platform !== "all") params.set("platform", platform);
      const res = await fetch(`/api/templates/marketplace?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        const next = json.data.items ?? [];
        setTotal(json.data.total ?? 0);
        setItems((prev) => (page === 1 ? next : [...prev, ...next]));
      }
    } finally {
      setLoading(false);
    }
  }, [page, debounced, platform, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewFor = (t: MItem) => {
    const imgs = t.previewImages as string[] | null | undefined;
    if (imgs && Array.isArray(imgs) && imgs[0]) return imgs[0];
    return t.previewUrl;
  };

  const scrollCarousel = (dir: number) => {
    carouselRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  const installTemplate = useCallback(
    async (templateId: string) => {
      setInstallingId(templateId);
      try {
        const res = await fetch(`/api/templates/${templateId}/install`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: { code?: string; message?: string };
        };
        if (json.success) {
          setInstalledIds((prev) => new Set(prev).add(templateId));
          setItems((prev) =>
            prev.map((x) => (x.id === templateId ? { ...x, installCount: x.installCount + 1 } : x))
          );
          enqueueToast({ title: "Installed", description: "Template added to your library.", type: "success" });
          return;
        }
        if (res.status === 409 || json.error?.code === "CONFLICT") {
          setInstalledIds((prev) => new Set(prev).add(templateId));
          enqueueToast({
            title: "Already in library",
            description: "This template was already installed.",
            type: "info",
          });
          return;
        }
        if (res.status === 401) {
          enqueueToast({
            title: "Sign in required",
            description: "Log in to install templates.",
            type: "error",
          });
          return;
        }
        if (res.status === 403) {
          enqueueToast({
            title: "Unavailable",
            description: json.error?.message ?? "This template cannot be installed.",
            type: "error",
          });
          return;
        }
        enqueueToast({
          title: "Could not install",
          description: json.error?.message ?? `Something went wrong (${res.status}).`,
          type: "error",
        });
      } catch {
        enqueueToast({ title: "Network error", description: "Try again in a moment.", type: "error" });
      } finally {
        setInstallingId(null);
      }
    },
    [enqueueToast]
  );

  const subtitleCount = useMemo(() => Math.max(total, items.length), [total, items.length]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-16">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--surface-elevated))] to-[hsl(var(--background))] px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">Template Marketplace</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Browse {subtitleCount}+ templates created by the DesignForge community
        </p>
        <div className="mt-6 flex max-w-xl items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2">
          <Search className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
      </div>

      {collections.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Featured collections</h2>
            <div className="flex gap-1">
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => scrollCarousel(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => scrollCarousel(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div
            ref={carouselRef}
            className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/templates/collections/${c.id}`}
                className="min-w-[260px] max-w-[260px] flex-shrink-0 snap-start overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] transition hover:border-[hsl(var(--accent))]"
              >
                <div className="h-28 bg-[hsl(var(--background))]">
                  {c.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
                      {c.templateCount} templates
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="line-clamp-1 text-sm font-medium text-[hsl(var(--foreground))]">{c.name}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">View collection →</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPage(1);
              setPlatform(p);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize",
              platform === p
                ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--accent))]"
                : "bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]"
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{total} results</p>
        <select
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs text-[hsl(var(--foreground))]"
          value={sort}
          onChange={(e) => {
            setPage(1);
            setSort(e.target.value);
          }}
        >
          <option value="popular">Most popular</option>
          <option value="rated">Highest rated</option>
          <option value="newest">Newest</option>
          <option value="used">Most used in designs</option>
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
          {debounced ? `No results for “${debounced}”. Try another search.` : "No templates match your filters."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((t) => (
            <div
              key={t.id}
              className="group relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] transition hover:border-[hsl(var(--accent))]"
            >
              <Link href={`/templates/${t.id}`} className="block">
                {t.isMarketplaceFeatured ? (
                  <span className="absolute left-2 top-2 z-10 rounded-full bg-[hsl(var(--warning))]/20 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--warning))]">
                    Featured
                  </span>
                ) : null}
                <div className="relative aspect-[4/3] bg-[hsl(var(--background))]">
                  {previewFor(t) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewFor(t)!}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  ) : t.htmlSnippet ? (
                    <iframe
                      title={t.name}
                      srcDoc={buildCardPreviewDoc(t.htmlSnippet)}
                      className="h-full w-full border-0 bg-white"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
                      Preview
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="line-clamp-1 text-sm font-semibold text-[hsl(var(--foreground))]">{t.name}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                    <span className="rounded bg-[hsl(var(--background))] px-1.5 py-0.5">{t.platform}</span>
                    <span className="rounded bg-[hsl(var(--background))] px-1.5 py-0.5">{t.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                      <Star className="h-3.5 w-3.5 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />
                      <span>{t.avgMarketplaceRating != null ? t.avgMarketplaceRating.toFixed(1) : "—"}</span>
                      <span className="text-[10px]">({t.marketplaceRatingCount})</span>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      <Download className="h-3 w-3" />
                      {t.installCount}
                    </span>
                  </div>
                </div>
              </Link>
              <div className="border-t border-[hsl(var(--border))] px-3 pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={installedIds.has(t.id) ? "secondary" : "default"}
                  className={cn(
                    "mt-2 w-full",
                    !installedIds.has(t.id) && "text-white hover:text-white"
                  )}
                  disabled={installingId === t.id || installedIds.has(t.id)}
                  onClick={() => void installTemplate(t.id)}
                >
                  {installedIds.has(t.id) ? "Installed ✓" : installingId === t.id ? "Installing…" : "Install"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length < total ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
