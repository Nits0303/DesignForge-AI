"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DesignCard } from "@/components/design/DesignCard";
import { useUIStore } from "@/store/useUIStore";

const QUICK_SHORTCODES = ["/instagram", "/linkedin", "/website", "/dashboard"];
const PREF_KEY_TRY_WEBSITE = "df:dashboard:try_website_prompt_shown_v1";
const LS_FILTER_KEY = "df:dashboard:recent_platform_filter";
const LS_QUICK_KEY = "df:dashboard:last_quick_shortcode";

export default function DashboardPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [recent, setRecent] = useState<any[]>([]);
  const [activeBrand, setActiveBrand] = useState<any>(null);
  const [stats, setStats] = useState({
    monthCount: 0,
    avgRevisions: 0,
    topPlatform: "—",
  });
  const { dashboardRecentPlatformFilter, setDashboardRecentPlatformFilter } = useUIStore((s) => s);
  const [tryWebsiteShown, setTryWebsiteShown] = useState<boolean | null>(null);
  const [lastQuickShortcode, setLastQuickShortcode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [recentRes, statsRes, brandsRes] = await Promise.all([
        fetch("/api/designs/recent"),
        fetch("/api/dashboard/stats"),
        fetch("/api/brands"),
      ]);
      const [recentJson, statsJson, brandsJson] = await Promise.all([
        recentRes.json(),
        statsRes.json(),
        brandsRes.json(),
      ]);
      if (recentRes.ok && recentJson.success) {
        setRecent(recentJson.data ?? []);
      }
      if (statsRes.ok && statsJson.success) {
        setStats(statsJson.data);
      }
      if (brandsRes.ok && brandsJson.success) {
        const defaultBrand = (brandsJson.data ?? []).find((b: any) => b.isDefault);
        setActiveBrand(defaultBrand ?? brandsJson.data?.[0] ?? null);
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
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a design to generate..."
            className="h-10 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
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
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 md:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">Active brand</div>
              <div className="mt-1 text-sm font-semibold">{activeBrand?.name ?? "No brand selected"}</div>
              <div className="mt-2 flex gap-1.5">
                {Object.values(activeBrand?.colors ?? {})
                  .slice(0, 5)
                  .map((c: any) => (
                    <span
                      key={String(c)}
                      className="h-3 w-3 rounded-full border border-[hsl(var(--border))]"
                      style={{ backgroundColor: String(c) }}
                    />
                  ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => router.push("/settings/brands")} className="hover:underline">
                Switch brand
              </button>
              <button onClick={() => router.push("/settings/brands")} className="hover:underline">
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
