"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PeriodSelector } from "@/components/analytics/PeriodSelector";
import { StackedBarChart, DonutChart, LineChart, HorizontalBarChart, MiniSparkline, AreaChart } from "@/components/analytics/charts";
import { PLATFORM_COLOR_MAP } from "@/constants/chartColors";
import { AI_MODELS } from "@/constants/models";
import { formatCost } from "@/lib/formatting";
import type { AnalyticsPeriod } from "@/lib/analytics/period";

const THRESHOLD_STALE_MS = 15 * 60 * 1000;

type AnalyticsSectionKey = "dashboard" | "designs" | "revisions" | "costs" | "templates" | "learning";

function analyticsErrorFromResponse(res: Response, json: any): string {
  if (res.status === 504) return "This request timed out. Try again.";
  const code = json?.error?.code ?? json?.code;
  if (code === "ANALYTICS_TIMEOUT") return json?.error?.message ?? "Analytics request timed out.";
  return json?.error?.message ?? `Request failed (${res.status}).`;
}

function normalizeArrayData<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([k]) => /^\d+$/.test(k))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v as T);
}

export default function AnalyticsPageClient({ initialPeriod }: { initialPeriod: AnalyticsPeriod }) {
  const router = useRouter();
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialPeriod);
  const [, startTransition] = useTransition();

  const [dashboard, setDashboard] = useState<any>(null);
  const [dashboardCachedAt, setDashboardCachedAt] = useState<string | null>(null);
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);

  const [designRows, setDesignRows] = useState<any[]>([]);
  const [platformDistribution, setPlatformDistribution] = useState<any[]>([]);
  const [designStackMode, setDesignStackMode] = useState<"platform" | "format">("platform");
  const [drillPlatform, setDrillPlatform] = useState<string | null>(null);
  const [drillFormatRows, setDrillFormatRows] = useState<any[]>([]);

  const [revisionTrend, setRevisionTrend] = useState<any[]>([]);
  const [revisionPatternBreakdown, setRevisionPatternBreakdown] = useState<any[]>([]);

  const [costRows, setCostRows] = useState<any[]>([]);
  const [costPlatformRows, setCostPlatformRows] = useState<any[]>([]);

  const [templates, setTemplates] = useState<any[]>([]);
  const [learning, setLearning] = useState<any>(null);

  const [loading, setLoading] = useState({
    dashboard: true,
    designs: true,
    revisions: true,
    costs: true,
    templates: true,
    learning: true,
  });

  const [sectionErrors, setSectionErrors] = useState<Record<AnalyticsSectionKey, string | null>>({
    dashboard: null,
    designs: null,
    revisions: null,
    costs: null,
    templates: null,
    learning: null,
  });

  const staleCheckAndRevalidate = async (cachedAt: string | null, revalidateFn: () => Promise<void>) => {
    if (!cachedAt) return;
    const ageMs = Date.now() - new Date(cachedAt).getTime();
    if (ageMs <= THRESHOLD_STALE_MS) return;
    // Revalidate in background (force backend recompute).
    void revalidateFn();
  };

  const refreshQ = (refresh?: boolean) => (refresh ? "&refresh=1" : "");

  const runDashboardFetch = async (refresh?: boolean) => {
    startTransition(() => {
      setLoading((s) => ({ ...s, dashboard: true }));
      setSectionErrors((s) => ({ ...s, dashboard: null }));
    });
    try {
      const dashboardUrl = `/api/analytics/dashboard?period=${period}${refreshQ(refresh)}`;
      const dRes = await fetch(dashboardUrl);
      const dJson = await dRes.json().catch(() => ({}));
      if (dRes.ok && dJson?.success) {
        setDashboard(dJson.data);
        setDashboardCachedAt(dJson.cachedAt ?? null);
      } else {
        setSectionErrors((s) => ({ ...s, dashboard: analyticsErrorFromResponse(dRes, dJson) }));
      }
    } catch {
      setSectionErrors((s) => ({ ...s, dashboard: "Network error. Try again." }));
    } finally {
      setLoading((s) => ({ ...s, dashboard: false }));
    }
  };

  const runDesignsFetch = async (refresh?: boolean) => {
    startTransition(() => {
      setLoading((s) => ({ ...s, designs: true }));
      setSectionErrors((s) => ({ ...s, designs: null }));
    });
    try {
      const designsByDayUrl = `/api/analytics/designs?period=${period}&groupBy=day${refreshQ(refresh)}`;
      const designsByPlatformUrl = `/api/analytics/designs?period=${period}&groupBy=platform${refreshQ(refresh)}`;
      const [ddRes, dpRes] = await Promise.all([fetch(designsByDayUrl), fetch(designsByPlatformUrl)]);
      const ddJson = await ddRes.json().catch(() => ({}));
      const dpJson = await dpRes.json().catch(() => ({}));
      const ddOk = ddRes.ok && ddJson?.success;
      const dpOk = dpRes.ok && dpJson?.success;
      if (ddOk && dpOk) {
        setDesignRows(normalizeArrayData(ddJson.data));
        setPlatformDistribution(normalizeArrayData(dpJson.data));
      } else {
        const msg = !ddOk ? analyticsErrorFromResponse(ddRes, ddJson) : analyticsErrorFromResponse(dpRes, dpJson);
        setSectionErrors((s) => ({ ...s, designs: msg }));
      }
    } catch {
      setSectionErrors((s) => ({ ...s, designs: "Network error. Try again." }));
    } finally {
      setLoading((s) => ({ ...s, designs: false }));
    }
  };

  const runRevisionsFetch = async (refresh?: boolean) => {
    startTransition(() => {
      setLoading((s) => ({ ...s, revisions: true }));
      setSectionErrors((s) => ({ ...s, revisions: null }));
    });
    try {
      const revisionsUrl = `/api/analytics/revisions?period=${period}${refreshQ(refresh)}`;
      const rRes = await fetch(revisionsUrl);
      const rJson = await rRes.json().catch(() => ({}));
      if (rRes.ok && rJson?.success) {
        setRevisionTrend(rJson.data?.trend ?? []);
        setRevisionPatternBreakdown(rJson.data?.patternBreakdown ?? []);
      } else {
        setSectionErrors((s) => ({ ...s, revisions: analyticsErrorFromResponse(rRes, rJson) }));
      }
    } catch {
      setSectionErrors((s) => ({ ...s, revisions: "Network error. Try again." }));
    } finally {
      setLoading((s) => ({ ...s, revisions: false }));
    }
  };

  const runCostsFetch = async (refresh?: boolean) => {
    startTransition(() => {
      setLoading((s) => ({ ...s, costs: true }));
      setSectionErrors((s) => ({ ...s, costs: null }));
    });
    try {
      const costsDayUrl = `/api/analytics/costs?period=${period}&groupBy=day${refreshQ(refresh)}`;
      const costsPlatformUrl = `/api/analytics/costs?period=${period}&groupBy=platform${refreshQ(refresh)}`;
      const [cDayRes, cPlatRes] = await Promise.all([fetch(costsDayUrl), fetch(costsPlatformUrl)]);
      const cDayJson = await cDayRes.json().catch(() => ({}));
      const cPlatJson = await cPlatRes.json().catch(() => ({}));
      const dayOk = cDayRes.ok && cDayJson?.success;
      const platOk = cPlatRes.ok && cPlatJson?.success;
      if (dayOk && platOk) {
        setCostRows(normalizeArrayData(cDayJson.data));
        setCostPlatformRows(normalizeArrayData(cPlatJson.data));
      } else {
        const msg = !dayOk ? analyticsErrorFromResponse(cDayRes, cDayJson) : analyticsErrorFromResponse(cPlatRes, cPlatJson);
        setSectionErrors((s) => ({ ...s, costs: msg }));
      }
    } catch {
      setSectionErrors((s) => ({ ...s, costs: "Network error. Try again." }));
    } finally {
      setLoading((s) => ({ ...s, costs: false }));
    }
  };

  const runTemplatesFetch = async (refresh?: boolean) => {
    startTransition(() => {
      setLoading((s) => ({ ...s, templates: true }));
      setSectionErrors((s) => ({ ...s, templates: null }));
    });
    try {
      const templatesUrl = `/api/analytics/templates?period=${period}&limit=10${refreshQ(refresh)}`;
      const tRes = await fetch(templatesUrl);
      const tJson = await tRes.json().catch(() => ({}));
      if (tRes.ok && tJson?.success) {
        setTemplates(normalizeArrayData(tJson.data));
      } else {
        setSectionErrors((s) => ({ ...s, templates: analyticsErrorFromResponse(tRes, tJson) }));
      }
    } catch {
      setSectionErrors((s) => ({ ...s, templates: "Network error. Try again." }));
    } finally {
      setLoading((s) => ({ ...s, templates: false }));
    }
  };

  const runLearningFetch = async (refresh?: boolean) => {
    startTransition(() => {
      setLoading((s) => ({ ...s, learning: true }));
      setSectionErrors((s) => ({ ...s, learning: null }));
    });
    try {
      const learningUrl = `/api/analytics/learning?period=${period}${refreshQ(refresh)}`;
      const lRes = await fetch(learningUrl);
      const lJson = await lRes.json().catch(() => ({}));
      if (lRes.ok && lJson?.success) {
        setLearning(lJson.data ?? null);
      } else {
        setSectionErrors((s) => ({ ...s, learning: analyticsErrorFromResponse(lRes, lJson) }));
      }
    } catch {
      setSectionErrors((s) => ({ ...s, learning: "Network error. Try again." }));
    } finally {
      setLoading((s) => ({ ...s, learning: false }));
    }
  };

  const retrySection = (key: AnalyticsSectionKey) => {
    const runners: Record<AnalyticsSectionKey, () => Promise<void>> = {
      dashboard: () => runDashboardFetch(false),
      designs: () => runDesignsFetch(false),
      revisions: () => runRevisionsFetch(false),
      costs: () => runCostsFetch(false),
      templates: () => runTemplatesFetch(false),
      learning: () => runLearningFetch(false),
    };
    void runners[key]();
  };

  const fetchAll = async (opts: { refresh?: boolean }) => {
    const r = opts.refresh;
    startTransition(() => {
      setSectionErrors({
        dashboard: null,
        designs: null,
        revisions: null,
        costs: null,
        templates: null,
        learning: null,
      });
    });
    await Promise.all([
      runDashboardFetch(r),
      runDesignsFetch(r),
      runRevisionsFetch(r),
      runCostsFetch(r),
      runTemplatesFetch(r),
      runLearningFetch(r),
    ]);
  };

  const loadFormatDrilldown = async (platform: string) => {
    const res = await fetch(`/api/analytics/designs?period=${period}&groupBy=format&platform=${encodeURIComponent(platform)}`);
    const json = await res.json();
    if (res.ok && json?.success) {
      setDrillPlatform(platform);
      setDrillFormatRows(normalizeArrayData(json.data));
      setDesignStackMode("format");
    }
  };

  useEffect(() => {
    void fetchAll({ refresh: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/preferences?key=analytics_onboarding_banner_dismissed");
        const json = await res.json();
        const dismissed = Boolean(json?.success && json?.data?.preferenceValue === true);
        if (mounted) setShowOnboardingBanner(!dismissed);
      } catch {
        if (mounted) setShowOnboardingBanner(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // SWR: if cachedAt is old, request a refresh=1 update for the dashboard (and best-effort charts).
  useEffect(() => {
    void staleCheckAndRevalidate(dashboardCachedAt, async () => {
      await fetchAll({ refresh: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardCachedAt]);

  const totalDesigns = dashboard?.totalDesigns ?? 0;
  const insufficientTrend = totalDesigns > 0 && totalDesigns < 5;

  const stale = useMemo(() => {
    if (!dashboardCachedAt) return null;
    const ageMs = Date.now() - new Date(dashboardCachedAt).getTime();
    return ageMs > THRESHOLD_STALE_MS;
  }, [dashboardCachedAt]);

  const designBarData = useMemo(() => {
    // API rows: { date, count, platform }
    const byDate = new Map<string, Record<string, any>>();
    const platforms = new Set<string>();

    for (const r of designRows) {
      const date = r.date;
      const platform = r.platform;
      platforms.add(platform);
      if (!byDate.has(date)) byDate.set(date, { date });
      const cur = byDate.get(date)!;
      cur[platform] = Number(r.count ?? 0);
    }

    const out = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { data: out, platforms: Array.from(platforms) };
  }, [designRows]);

  const formatBarData = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    const row: Record<string, any> = { date };
    const formats: string[] = [];
    for (const r of drillFormatRows) {
      const key = String(r.format ?? "unknown");
      formats.push(key);
      row[key] = Number(r.count ?? 0);
    }
    return { data: drillPlatform ? [row] : [], formats: Array.from(new Set(formats)) };
  }, [drillFormatRows, drillPlatform]);

  const platformDonutData = useMemo(() => {
    return (platformDistribution ?? []).map((p) => ({
      name: p.platform,
      value: Number(p.count ?? 0),
      color: PLATFORM_COLOR_MAP[p.platform as keyof typeof PLATFORM_COLOR_MAP] ?? "var(--accent-primary)",
    }));
  }, [platformDistribution]);

  const costAreaData = useMemo(() => {
    // API rows: { date, costUsd, model }
    const modelLabel = (m: string) => {
      if (m?.includes?.("gemini")) return "Gemini 2.5 Flash";
      if (m === AI_MODELS.ROUTER_HAIKU) return "Haiku";
      if (m === AI_MODELS.GENERATOR_SONNET) return "Sonnet";
      if (m === AI_MODELS.FALLBACK_OPUS) return "Opus";
      return m ?? "Unknown";
    };

    const byDate = new Map<string, Record<string, any>>();
    const models = new Set<string>();
    for (const r of costRows) {
      const date = r.date;
      const model = modelLabel(r.model);
      models.add(model);
      if (!byDate.has(date)) byDate.set(date, { date });
      const cur = byDate.get(date)!;
      cur[model] = Number(r.costUsd ?? 0);
    }
    return { data: Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))), models: Array.from(models) };
  }, [costRows]);

  const costAreaSeries = useMemo(() => {
    const palette = [
      "hsl(var(--accent) / 0.35)",
      "var(--accent-primary)",
      "hsl(var(--accent) / 0.65)",
    ];
    return costAreaData.models.map((key, i) => ({
      key,
      label: key,
      color: palette[i % palette.length]!,
    }));
  }, [costAreaData.models]);

  const revisionTarget = 1.0;
  const revision30dAvg = dashboard?.avgRevisionsPerDesign ?? null;

  const mostCommonRevision = revisionPatternBreakdown?.[0]?.patternType ?? null;
  const fewerRevisionsSinceStart = useMemo(() => {
    if (!revisionTrend?.length) return null;
    const first = Number(revisionTrend[0]?.avgRevisions ?? 0);
    const last = Number(revisionTrend[revisionTrend.length - 1]?.avgRevisions ?? 0);
    if (first <= 0 || last < 0) return null;
    return ((first - last) / first) * 100;
  }, [revisionTrend]);

  const learningSparkData = useMemo(() => {
    const trend = learning?.qualityTrend ?? [];
    // MiniSparkline expects an array of objects with y-value.
    return trend.map((t: any) => ({ weekStart: t.weekStart, score: Number(t.qualityScore ?? 0) }));
  }, [learning]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {dashboardCachedAt ? (
              <>
                Last updated{" "}
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {new Date(dashboardCachedAt).toLocaleString()}
                </span>
                {stale ? <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">(refreshing…)</span> : null}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/analytics/export?period=${period}`);
              if (!res.ok) return;
              const blob = await res.blob();
              const dlUrl = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = dlUrl;
              a.download = `designforge_analytics_${period}_${new Date().toISOString().slice(0, 10)}.zip`;
              a.click();
              URL.revokeObjectURL(dlUrl);
            }}
            className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm font-semibold"
          >
            Export data
          </button>
          <PeriodSelector
            onChange={(p) => {
              setPeriod(p);
              router.replace(`/analytics?period=${p}`);
            }}
          />
        </div>
      </div>

      {showOnboardingBanner && totalDesigns > 0 && totalDesigns <= 7 ? (
        <div className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(214 80% 45% / 0.16)] p-3">
          <div className="text-sm text-[hsl(var(--foreground))]">
            You're just getting started! Analytics improve as you generate more designs. The learning engine begins working after your 5th design.
          </div>
          <button
            type="button"
            onClick={async () => {
              setShowOnboardingBanner(false);
              await fetch("/api/preferences/analytics_onboarding_banner_dismissed", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preferenceValue: true }),
              }).catch(() => {});
            }}
            className="text-xs text-[hsl(var(--foreground))] underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {totalDesigns === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6 text-center">
          <div className="text-xl font-bold">No design data yet</div>
          <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Generate your first design to start seeing analytics.</div>
          <ButtonLink href="/workspace">Go to workspace</ButtonLink>
        </div>
      ) : (
        <>
          <SectionErrorBanner message={sectionErrors.dashboard} onRetry={() => retrySection("dashboard")} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <StatCard
              title="Designs Generated"
              value={dashboard?.totalDesigns ?? 0}
              changeValue={dashboard?.totalDesignsChangePercent ?? null}
              invertGood={false}
              loading={loading.dashboard}
              formatValue={(v) => String(v)}
            />

            <StatCard
              title="Avg. Revisions per Design"
              value={Number(dashboard?.avgRevisionsPerDesign ?? 0).toFixed(2)}
              changeValue={dashboard?.avgRevisionsPerDesignChangePercent ?? null}
              invertGood={true}
              loading={loading.dashboard}
            />

            <StatCard
              title="First-Attempt Approval Rate"
              value={dashboard?.firstAttemptApprovalRate == null ? "-" : `${Number(dashboard.firstAttemptApprovalRate).toFixed(1)}%`}
              changeValue={dashboard?.firstAttemptApprovalChangeFromPreviousPeriod ?? null}
              invertGood={false}
              loading={loading.dashboard}
              valueIsPercent
            />

            <StatCard
              title="Total AI Cost"
              value={formatCost(dashboard?.totalCostUsd ?? 0)}
              changeValue={dashboard?.totalCostChangePercent ?? null}
              invertGood={true}
              loading={loading.dashboard}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <MiniStat title="Cache Hit Rate" value={dashboard?.cacheHitRate == null ? "-" : `${Number(dashboard.cacheHitRate).toFixed(1)}%`} loading={loading.dashboard} />
            <MiniStat title="Active Learned Preferences" value={dashboard?.activeLearnedPreferences ?? 0} loading={loading.learning} />
            <MiniStat
              title="Designs via Batch"
              value={`${dashboard?.designsViaBatchCount ?? 0} (${dashboard?.designsViaBatchPercentage == null ? "-" : `${Number(dashboard.designsViaBatchPercentage).toFixed(1)}%`})`}
              loading={loading.dashboard}
            />
            <MiniStat title="Most Used Platform" value={dashboard?.mostUsedPlatform ?? "-"} loading={loading.dashboard} />
            <MiniStat title="Templates (Top 10)" value={templates?.length ?? 0} loading={loading.templates} />
          </div>

          <SectionErrorBanner message={sectionErrors.designs} onRetry={() => retrySection("designs")} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PanelTitle title="Design Volume" subtitle="Generated designs per day (stacked by platform)." />
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDesignStackMode("platform");
                    setDrillPlatform(null);
                    setDrillFormatRows([]);
                  }}
                  className={`rounded-[var(--radius)] px-2 py-1 text-xs ${designStackMode === "platform" ? "bg-[hsl(var(--accent-muted))]" : "bg-[hsl(var(--surface-elevated))]"}`}
                >
                  By Platform
                </button>
                <button
                  type="button"
                  onClick={() => setDesignStackMode("format")}
                  className={`rounded-[var(--radius)] px-2 py-1 text-xs ${designStackMode === "format" ? "bg-[hsl(var(--accent-muted))]" : "bg-[hsl(var(--surface-elevated))]"}`}
                >
                  By Format
                </button>
                {drillPlatform ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDrillPlatform(null);
                      setDrillFormatRows([]);
                      setDesignStackMode("platform");
                    }}
                    className="text-xs text-[hsl(var(--accent))] underline"
                  >
                    ← Back
                  </button>
                ) : null}
              </div>
              {insufficientTrend ? (
                <OverlayInfo text="Generate a few more designs to see trend data." />
              ) : null}
              <StackedBarChart
                data={designStackMode === "format" ? formatBarData.data : designBarData.data}
                xKey="date"
                loading={loading.designs}
                empty={(designStackMode === "format" ? formatBarData.data : designBarData.data).length === 0}
                series={
                  designStackMode === "format"
                    ? formatBarData.formats.map((f, idx) => ({
                        key: f,
                        label: f,
                        color: idx === 0 ? "var(--accent-primary)" : "hsl(var(--accent) / 0.55)",
                      }))
                    : designBarData.platforms.map((p) => ({
                        key: p,
                        label: p,
                        color: PLATFORM_COLOR_MAP[p as keyof typeof PLATFORM_COLOR_MAP] ?? "var(--accent-primary)",
                      }))
                }
              />
            </div>

            <div>
              <PanelTitle title="Platform Distribution" subtitle="Share of generated designs by platform." />
              <DonutChart
                data={platformDonutData}
                loading={loading.designs}
                empty={platformDonutData.length === 0}
                innerRadius={70}
                centerLabel={{ top: String(totalDesigns), bottom: "Total" }}
                onSegmentClick={(x) => {
                  const platform = String((x as any)?.name ?? "");
                  if (!platform) return;
                  void loadFormatDrilldown(platform);
                }}
              />
            </div>
          </div>

          <SectionErrorBanner message={sectionErrors.revisions} onRetry={() => retrySection("revisions")} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <PanelTitle title="Revision Rate Trend" subtitle="Average revisions per design (weekly)." />
              {insufficientTrend ? <OverlayInfo text="Generate a few more designs to see trend data." /> : null}
              <LineChart
                data={revisionTrend}
                xKey="weekStart"
                loading={loading.revisions}
                empty={revisionTrend.length === 0}
                series={[{ key: "avgRevisions", label: "Avg revisions", color: "var(--accent-primary)" }]}
                referenceLines={[
                  { value: revisionTarget, label: "Target", color: "var(--border-default)" },
                  ...(revision30dAvg != null ? [{ value: revision30dAvg, label: "Your 30d avg", color: "var(--accent-subtle)" }] : []),
                ]}
                annotations={
                  learning?.firstPreferenceInferredAt
                    ? [{ x: new Date(learning.firstPreferenceInferredAt).toISOString().slice(0, 10), label: "Learning started" }]
                    : []
                }
              />
              {fewerRevisionsSinceStart != null ? (
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  ↓ {Math.max(0, fewerRevisionsSinceStart).toFixed(1)}% fewer revisions since your first design.
                </div>
              ) : null}
              {mostCommonRevision ? (
                <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  Your most common revision is <span className="font-semibold text-[hsl(var(--foreground))]">{mostCommonRevision}</span>. DesignForge AI is learning to pre-apply this.
                </div>
              ) : null}
            </div>

            <div>
              <PanelTitle title="Revision Pattern Breakdown" subtitle="Most requested revision types." />
              <HorizontalBarChart
                data={revisionPatternBreakdown ?? []}
                labelKey="patternType"
                valueKey="count"
                color="var(--accent-primary)"
                loading={loading.revisions}
                empty={(revisionPatternBreakdown ?? []).length === 0}
              />
            </div>
          </div>

          <SectionErrorBanner message={sectionErrors.costs} onRetry={() => retrySection("costs")} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <PanelTitle title="AI Cost" subtitle="Daily AI cost by model (stacked)." />
              <AreaChart
                data={costAreaData.data}
                xKey="date"
                series={costAreaSeries.map((s) => ({ key: s.key, label: s.label, color: s.color, fillOpacity: 0.18 }))}
                loading={loading.costs}
                empty={costAreaData.data.length === 0}
                referenceLines={[]}
              />

              <div className="mt-3 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 text-sm">
                <div className="font-semibold">Cost insights</div>
                <div className="text-[hsl(var(--muted-foreground))]">
                  You've saved <span className="font-semibold text-[hsl(var(--foreground))]">{formatCost(dashboard?.estimatedSavingsFromCaching ?? 0)}</span> through prompt caching this period.
                  {(dashboard?.batchApiSavings ?? 0) > 0 ? (
                    <>
                      {" "}
                      Using Batch API saved{" "}
                      <span className="font-semibold text-[hsl(var(--foreground))]">{formatCost(dashboard?.batchApiSavings ?? 0)}</span>.
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionErrorBanner message={sectionErrors.templates} onRetry={() => retrySection("templates")} />
              <div>
                <PanelTitle title="Template Performance" subtitle="Top templates by usage in this period." />
                <ol className="space-y-2">
                  {templates?.map((t, idx) => (
                    <li key={t.templateId ?? idx} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{t.name}</div>
                        <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                          {t.category} • {t.platform}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-[hsl(var(--accent-muted))] px-2 py-0.5 text-xs font-semibold">
                          #{idx + 1} • {t.usageCount ?? 0} uses
                        </span>
                        <ApprovalDot rate={t.avgApprovalRate ?? null} />
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 text-sm">
                  <Link href="/templates" className="text-[hsl(var(--accent))] hover:underline">
                    View full template library
                  </Link>
                </div>
              </div>

              <SectionErrorBanner message={sectionErrors.learning} onRetry={() => retrySection("learning")} />
              <div>
                <PanelTitle title="Learning Engine Health" subtitle="How your quality improves over time." />
                <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">Active preferences</div>
                      <div className="text-2xl font-bold">{learning?.activePreferenceCount ?? 0}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        {learning?.createdAt ? (
                          <>
                            Started: {new Date(learning.createdAt).toLocaleDateString()}
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                    <div className="w-24">
                      <MiniSparkline
                        data={learningSparkData}
                        valueKey="score"
                        color="var(--accent-primary)"
                        width={96}
                        height={40}
                      />
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                    {totalDesigns < 5
                      ? "Keep generating designs to help DesignForge learn your style."
                      : totalDesigns < 15 && (learning?.activePreferenceCount ?? 0) === 0
                        ? "Almost there — DesignForge is analysing your patterns."
                        : (learning?.activePreferenceCount ?? 0) >= 4
                          ? "DesignForge knows your style. Designs are getting better with every session."
                          : "DesignForge is learning your style. Preferences are being applied."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cost breakdown by platform (simple) */}
          <div className="mt-2">
            <PanelTitle title="Cost by Platform" subtitle="Total cost split across your platforms." />
            <HorizontalBarChart
              data={costPlatformRows ?? []}
              labelKey="platform"
              valueKey="costUsd"
              color="var(--accent-primary)"
              loading={loading.costs}
              empty={(costPlatformRows ?? []).length === 0}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SectionErrorBanner({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  if (!message) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[hsl(var(--destructive))]/35 bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm">
      <span className="text-[hsl(var(--foreground))]">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs font-semibold hover:bg-[hsl(var(--surface))]"
      >
        Retry
      </button>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <div className="text-sm font-semibold">{title}</div>
      {subtitle ? <div className="text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</div> : null}
    </div>
  );
}

function OverlayInfo({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[var(--radius-card)] bg-[hsl(var(--surface))]/80 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
      {text}
    </div>
  );
}

function StatCard({
  title,
  value,
  changeValue,
  invertGood,
  loading,
  formatValue,
  valueIsPercent,
}: {
  title: string;
  value: any;
  changeValue: number | null;
  invertGood: boolean;
  loading: boolean;
  formatValue?: (v: any) => string;
  valueIsPercent?: boolean;
}) {
  const fontFamily = "var(--font-inter)";
  const { changeText, colorClass } = useMemo(() => {
    if (changeValue == null || Number.isNaN(changeValue)) return { changeText: "-", colorClass: "text-[hsl(var(--muted-foreground))]" };
    const improved = invertGood ? changeValue < 0 : changeValue > 0;
    const pct = Number(changeValue);
    const text = `${improved ? (pct >= 0 ? "+" : "") : pct < 0 ? "" : "+"}${pct.toFixed(1)}%`;
    return { changeText: text, colorClass: improved ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]" };
  }, [changeValue, invertGood]);

  return (
    <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className={`text-xs font-semibold ${colorClass}`}>{loading ? "…" : changeText}</div>
      </div>
      <div className={`mt-2 text-2xl font-bold`} style={{ fontFamily }}>
        {loading ? "…" : typeof value === "number" ? formatValue?.(value) ?? String(value) : value}
      </div>
    </div>
  );
}

function MiniStat({ title, value, loading }: { title: string; value: any; loading: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3">
      <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{title}</div>
      <div className="mt-1 text-lg font-bold">{loading ? "…" : value}</div>
    </div>
  );
}

function ApprovalDot({ rate }: { rate: number | null }) {
  const { color } = useMemo(() => {
    if (rate == null) return { color: "bg-[hsl(var(--muted-foreground))]" };
    if (rate >= 70) return { color: "bg-[hsl(var(--success))]" };
    if (rate >= 40) return { color: "bg-[hsl(38 70% 50%)]" };
    return { color: "bg-[hsl(var(--destructive))]" };
  }, [rate]);

  return <span className={`h-3 w-3 rounded-full ${color}`} title={rate == null ? "N/A" : `Approval ${rate.toFixed(1)}%`} />;
}

function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center justify-center rounded-[var(--radius)] bg-[hsl(var(--accent))] px-4 py-2 text-sm font-semibold !text-white no-underline hover:bg-[hsl(var(--accent-hover))] hover:no-underline"
    >
      {children}
    </Link>
  );
}

