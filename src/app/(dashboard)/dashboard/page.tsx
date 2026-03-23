"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DesignCard } from "@/components/design/DesignCard";
import { MarketplaceDashboardWidget } from "@/components/marketplace/MarketplaceDashboardWidget";
import { useUIStore } from "@/store/useUIStore";
import { useBrandStore } from "@/store/useBrandStore";
import { brandSwatchesFromMap } from "@/lib/brand/colorSwatches";

const QUICK_SHORTCODES = ["/instagram", "/linkedin", "/website", "/dashboard"];
const PREF_KEY_TRY_WEBSITE = "df:dashboard:try_website_prompt_shown_v1";
const LS_FILTER_KEY = "df:dashboard:recent_platform_filter";
const LS_QUICK_KEY = "df:dashboard:last_quick_shortcode";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [recent, setRecent] = useState<any[]>([]);
  const [recentBatches, setRecentBatches] = useState<any[]>([]);
  const [stats, setStats] = useState({
    monthCount: 0,
    avgRevisions: 0,
    topPlatform: "—",
  });
  const { dashboardRecentPlatformFilter, setDashboardRecentPlatformFilter, enqueueToast } = useUIStore((s) => s);
  const { brands, activeBrandId, setBrands, setActiveBrandId } = useBrandStore();
  const [tryWebsiteShown, setTryWebsiteShown] = useState<boolean | null>(null);
  const [lastQuickShortcode, setLastQuickShortcode] = useState<string | null>(null);
  const adminDeniedToastShown = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const autoResizePrompt = () => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 150);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 150 ? "auto" : "hidden";
  };

  useEffect(() => {
    autoResizePrompt();
  }, [prompt]);


  useEffect(() => {
    if (adminDeniedToastShown.current) return;
    if (searchParams.get("admin_denied") !== "1") return;
    adminDeniedToastShown.current = true;
    enqueueToast({
      title: "Access denied",
      description: "You don't have permission to view the admin area.",
      type: "error",
    });
    router.replace("/dashboard", { scroll: false });
  }, [searchParams, enqueueToast, router]);

  useEffect(() => {
    (async () => {
      const [recentRes, statsRes, brandsRes, batchesRes] = await Promise.all([
        fetch("/api/designs/recent"),
        fetch("/api/dashboard/stats"),
        fetch("/api/brands"),
        fetch("/api/batch?limit=3"),
      ]);
      const [recentJson, statsJson, brandsJson, batchesJson] = await Promise.all([
        recentRes.json(),
        statsRes.json(),
        brandsRes.json(),
        batchesRes.json(),
      ]);
      if (recentRes.ok && recentJson.success) {
        setRecent(recentJson.data ?? []);
      }
      if (statsRes.ok && statsJson.success) {
        setStats(statsJson.data);
      }
      if (brandsRes.ok && brandsJson.success) {
        const list = brandsJson.data ?? [];
        setBrands(list);
        const active = list.find((b: any) => b.id === activeBrandId);
        if (!active && list.length > 0) {
          const defaultBrand = list.find((b: any) => b.isDefault);
          setActiveBrandId((defaultBrand ?? list[0]).id);
        }
      }
      if (batchesRes.ok && batchesJson.success) {
        setRecentBatches(batchesJson.data?.jobs ?? []);
      }
    })();
  }, []);

  // Persist dashboard filter and quick action selection.
  useEffect(() => {
    try {
      const savedFilter = localStorage.getItem(LS_FILTER_KEY);
      if (savedFilter) setDashboardRecentPlatformFilter(savedFilter as any);
      const savedQuick = localStorage.getItem(LS_QUICK_KEY);
      if (savedQuick) setLastQuickShortcode(savedQuick);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTER_KEY, dashboardRecentPlatformFilter);
    } catch {}
  }, [dashboardRecentPlatformFilter]);

  useEffect(() => {
    if (!lastQuickShortcode) return;
    try {
      localStorage.setItem(LS_QUICK_KEY, lastQuickShortcode);
    } catch {}
  }, [lastQuickShortcode]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/preferences?key=${encodeURIComponent(PREF_KEY_TRY_WEBSITE)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.success && json.data != null) {
          setTryWebsiteShown(true);
        } else {
          setTryWebsiteShown(false);
        }
      } catch {
        setTryWebsiteShown(false);
      }
    })();
  }, []);

  const activeBrand = useMemo(
    () => brands.find((b) => b.id === activeBrandId) ?? brands.find((b) => b.isDefault) ?? null,
    [brands, activeBrandId]
  );

  const activeBrandSwatches = useMemo(
    () => brandSwatchesFromMap((activeBrand?.colors ?? null) as Record<string, unknown> | null, 5),
    [activeBrand]
  );

  const filteredRecent = useMemo(() => {
    if (dashboardRecentPlatformFilter === "all") return recent;
    return recent.filter((d) => d.platform === dashboardRecentPlatformFilter);
  }, [recent, dashboardRecentPlatformFilter]);

  const empty = useMemo(() => filteredRecent.length === 0, [filteredRecent.length]);

  const hasWebOrDash = useMemo(
    () => recent.some((d) => d.platform === "website" || d.platform === "dashboard"),
    [recent]
  );
  const hasSocial = useMemo(
    () => recent.some((d) => ["instagram", "linkedin", "twitter", "facebook"].includes(d.platform)),
    [recent]
  );

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Platform filter</div>
            <select
              className="mt-1 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
              value={dashboardRecentPlatformFilter}
              onChange={(e) => setDashboardRecentPlatformFilter(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">Twitter</option>
              <option value="facebook">Facebook</option>
              <option value="website">Website</option>
              <option value="dashboard">Dashboard</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>

          {!hasWebOrDash && hasSocial && tryWebsiteShown === false ? (
            <div className="md:w-[360px] rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
              <div className="text-sm font-semibold">Try website generation</div>
              <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Generate a multi-section landing page with live streaming and section editing.
              </div>
              <div className="mt-3">
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      await fetch("/api/preferences", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ preferenceKey: PREF_KEY_TRY_WEBSITE, preferenceValue: true }),
                      });
                    } catch {}
                    router.push(`/workspace?prompt=${encodeURIComponent("/website landing page")}`);
                  }}
                >
                  Try it
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
        <div className="flex gap-3">
          <textarea
            ref={promptRef}
            value={prompt}
            rows={1}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (prompt.trim()) router.push(`/workspace?prompt=${encodeURIComponent(prompt)}`);
              }
            }}
            placeholder="Describe a design to generate..."
            style={{
              resize: "none",
              overflow: "hidden",
              maxHeight: "150px",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
            className="min-h-10 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 pr-4 text-sm whitespace-pre-wrap"
          />
          <Button
            onClick={() => router.push(`/workspace?prompt=${encodeURIComponent(prompt)}`)}
            disabled={!prompt.trim()}
          >
            Generate Design
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_SHORTCODES.map((code) => (
            <button
              key={code}
              type="button"
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                lastQuickShortcode === code
                  ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
                  : "bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
              onClick={() => {
                setPrompt(`${code} `);
                setLastQuickShortcode(code);
              }}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 md:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">Batch Generate</div>
              <div className="mt-1 text-sm font-semibold">Create a batch from a calendar</div>
            </div>
            <Button size="sm" onClick={() => router.push("/batch/new")}>
              New batch
            </Button>
          </div>
          {recentBatches.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">Recent batches</div>
              {recentBatches.map((b: any) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => router.push(`/batch/${b.id}`)}
                  className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface-elevated))]/80"
                >
                  <div className="font-semibold truncate">{b.name}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {b.completedItems}/{b.totalItems} • {b.status}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">No recent batches yet.</div>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 md:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">Active brand</div>
              <div className="mt-1 text-sm font-semibold">{activeBrand?.name ?? "No brand selected"}</div>
              <div className="mt-2 flex gap-1.5">
                {activeBrandSwatches.map((sw) => (
                  <span
                    key={sw.role}
                    title={sw.role}
                    className="h-3 w-3 rounded-full border border-[hsl(var(--border))]"
                    style={{ backgroundColor: sw.value }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[hsl(var(--muted-foreground))]">Switch with top brand selector</span>
              <button onClick={() => router.push("/brands")} className="hover:underline">
                Manage brands
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Designs this month</div>
          <div className="mt-2 text-2xl font-bold">{stats.monthCount}</div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Average revisions</div>
          <div className="mt-2 text-2xl font-bold">{stats.avgRevisions.toFixed(1)}</div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Most used platform</div>
          <div className="mt-2 text-2xl font-bold capitalize">{stats.topPlatform}</div>
        </div>
      </div>

      <MarketplaceDashboardWidget />

      {empty ? (
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-10 text-center">
          <div className="text-lg font-semibold">Your designs will appear here</div>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Create your first design to start building your library.
          </p>
          <div className="mt-4">
            <Button onClick={() => router.push("/workspace")}>Create your first design</Button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
            Recent designs
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filteredRecent.map((d) => (
              <DesignCard key={d.id} design={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
