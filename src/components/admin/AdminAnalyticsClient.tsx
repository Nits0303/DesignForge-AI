"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Note: this component fetches data from /api/analytics/admin/* routes.
type OverviewPayload = any;
type PromptScoreRow = any;
type TemplatesPayload = any;
type LearningPayload = any;
type CostsPayload = any;
type BatchPayload = any;
type SystemLogsPayload = any;

type TabKey = "overview" | "promptScores" | "templates" | "learning" | "costs" | "batch" | "abTests" | "systemLogs";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "promptScores", label: "Prompt Scores" },
  { key: "templates", label: "Template Performance" },
  { key: "learning", label: "Learning Engine" },
  { key: "costs", label: "Cost Analysis" },
  { key: "batch", label: "Batch Analytics" },
  { key: "abTests", label: "A/B Tests" },
  { key: "systemLogs", label: "System Logs" },
];

export function AdminAnalyticsClient() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");

  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [promptScores, setPromptScores] = useState<PromptScoreRow[]>([]);
  const [templatesPayload, setTemplatesPayload] = useState<TemplatesPayload | null>(null);
  const [learning, setLearning] = useState<LearningPayload | null>(null);
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [batch, setBatch] = useState<BatchPayload | null>(null);
  const [systemLogs, setSystemLogs] = useState<SystemLogsPayload | null>(null);
  const [abTests, setAbTests] = useState<any[]>([]);
  const [abSuggestions, setAbSuggestions] = useState<any[]>([]);

  const [promptFilters, setPromptFilters] = useState<{ platform?: string; format?: string; minUses: number }>({
    minUses: 0,
  });

  const [logsPage, setLogsPage] = useState(1);
  const [logsExpandedId, setLogsExpandedId] = useState<string | null>(null);
  const [promptSort, setPromptSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });
  const [templateMode, setTemplateMode] = useState<"top" | "bottom">("top");

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url);
    const json = await res.json();
    if (res.status === 403) {
      window.alert("Admin access has been revoked");
      router.push("/dashboard");
      throw new Error("FORBIDDEN");
    }
    if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Request failed");
    return json.data as T;
  };

  const refreshTab = async (t: TabKey, opts?: { refresh?: boolean }) => {
    const refresh = opts?.refresh ? "&refresh=1" : "";
    if (t === "overview") {
      const data = await fetchJson<OverviewPayload>(`/api/analytics/admin/overview${refresh}`);
      setOverview(data);
      return;
    }
    if (t === "promptScores") {
      const qs = new URLSearchParams();
      if (promptFilters.platform) qs.set("platform", promptFilters.platform);
      if (promptFilters.format) qs.set("format", promptFilters.format);
      qs.set("minUses", String(promptFilters.minUses));
      const data = await fetchJson<any>(`/api/analytics/admin/prompt-scores?${qs.toString()}${refresh}`);
      setPromptScores(data ?? []);
      return;
    }
    if (t === "templates") {
      const qs = new URLSearchParams();
      qs.set("minUses", "20");
      const data = await fetchJson<any>(`/api/analytics/admin/templates?${qs.toString()}${refresh}`);
      setTemplatesPayload(data);
      return;
    }
    if (t === "learning") {
      const data = await fetchJson<any>(`/api/analytics/admin/learning${refresh}`);
      setLearning(data);
      return;
    }
    if (t === "costs") {
      const qs = new URLSearchParams();
      qs.set("sinceDays", "30");
      const data = await fetchJson<any>(`/api/analytics/admin/costs?${qs.toString()}${refresh}`);
      setCosts(data);
      return;
    }
    if (t === "batch") {
      const data = await fetchJson<any>(`/api/analytics/admin/batch${refresh}`);
      setBatch(data);
      return;
    }
    if (t === "abTests") {
      const data = await fetchJson<{ tests: any[] }>(`/api/admin/ab-tests${refresh}`);
      setAbTests(data.tests ?? []);
      const sug = await fetchJson<{ suggestions: any[] }>(`/api/admin/ab-test-suggestions${refresh}`);
      setAbSuggestions(sug.suggestions ?? []);
      return;
    }
    if (t === "systemLogs") {
      const data = await fetchJson<any>(`/api/analytics/admin/system-logs?page=${logsPage}&pageSize=20${refresh}`);
      setSystemLogs(data);
      return;
    }
  };

  useEffect(() => {
    void refreshTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, logsPage, promptFilters.platform, promptFilters.format, promptFilters.minUses]);

  const runBatchNow = async () => {
    const prevPage = logsPage;
    setTab("systemLogs");
    try {
      await fetch("/api/analytics/admin/recalculate", { method: "POST" });
      // Force refresh by changing page twice.
      setLogsExpandedId(null);
      setLogsPage(prevPage);
      void refreshTab("systemLogs", { refresh: true });
    } catch {
      // no toast system yet; fallback to reload UI.
      router.refresh();
    }
  };

  const scatterData = useMemo(() => {
    return (promptScores ?? []).map((r: any) => ({
      x: Number(r.zeroRevisionRate ?? 0),
      y: Number(r.avgRevisions ?? 0),
      size: Math.max(4, Math.min(40, (r.totalUses ?? 0) / 10)),
      platform: r.platform,
      format: r.format,
      score: r.score,
      totalUses: r.totalUses,
    }));
  }, [promptScores]);

  const sortedPromptScores = useMemo(() => {
    const rows = [...(promptScores ?? [])];
    rows.sort((a: any, b: any) => {
      const av = a?.[promptSort.key];
      const bv = b?.[promptSort.key];
      const cmp = typeof av === "string" || typeof bv === "string" ? String(av ?? "").localeCompare(String(bv ?? "")) : Number(av ?? 0) - Number(bv ?? 0);
      return promptSort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [promptScores, promptSort]);

  const scoreHistogram = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({ bucket: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`, count: 0 }));
    for (const r of promptScores ?? []) {
      const s = Math.max(0, Math.min(0.999, Number(r.score ?? 0)));
      const idx = Math.floor(s * 10);
      buckets[idx].count += 1;
    }
    return buckets;
  }, [promptScores]);

  const costForecast = useMemo(() => {
    const total30d = (costs?.byModel ?? []).reduce((a: number, r: any) => a + Number(r.totalCostUsd ?? 0), 0);
    const daily = total30d / 30;
    return {
      low: daily * 30 * 0.9,
      medium: daily * 30,
      high: daily * 30 * 1.2,
    };
  }, [costs]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-2 lg:sticky lg:top-4 h-fit rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3">
        <div className="mb-2 text-sm font-semibold">Admin analytics</div>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm font-semibold ${
              tab === t.key
                ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))] border border-l-2 border-[hsl(var(--accent))]"
                : "bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-elevated))]"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="pt-2">
          <Button onClick={runBatchNow} className="w-full">
            Run Batch Now
          </Button>
        </div>
      </aside>

      <section className="space-y-4">
        {tab === "overview" ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">Analytics Overview</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">System health and cost trends.</p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={async () => {
                  const res = await fetch("/api/analytics/admin/export");
                  if (!res.ok) return;
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `designforge_admin_aggregate_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export system data
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <KpiCard label="Total Users" value={overview?.totalUsers ?? 0} />
              <KpiCard label="Total Designs Generated" value={overview?.totalDesignsGenerated ?? 0} />
              <KpiCard label="Designs Today" value={overview?.designsToday ?? 0} />
              <KpiCard label="Active Users (7d)" value={overview?.activeUsers7d ?? 0} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard label="A/B tests running" value={overview?.abTestSummary?.runningCount ?? 0} />
              <KpiCard label="A/B winners awaiting review" value={overview?.abTestSummary?.pendingWinnerReviewCount ?? 0} />
              <KpiCard
                label="Closest test → min samples"
                value={
                  overview?.abTestSummary?.closestToMinSamples
                    ? `${overview.abTestSummary.closestToMinSamples.name.slice(0, 28)}… (${Math.round(
                        (overview.abTestSummary.closestToMinSamples.progress ?? 0) * 100
                      )}%)`
                    : "—"
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard label="Total API Cost (30d)" value={overview?.totalApiCostUsd30d ?? 0} format="cost" />
              <KpiCard label="Avg Cost per Design (30d)" value={overview?.avgCostPerDesignUsd30d ?? 0} format="costMaybe" />
              <KpiCard label="Global Cache Hit Rate" value={overview?.globalCacheHitRate ?? null} format="percentMaybe" />
            </div>

            <div>
              <KpiCard label="System Prompt Score (weighted)" value={overview?.systemPromptScoreWeighted ?? null} format="scoreMaybe" />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="Avg revisions vs prompt promotions (30d)">
                <LineChart data={overview?.promotionImpact?.series ?? []}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)" }} domain={[0, "auto"]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="avgRevisions"
                    stroke="var(--accent-primary)"
                    dot={false}
                    name="Avg revisions"
                  />
                  {(overview?.promotionImpact?.markers ?? []).map((m: { date: string; label: string }) => (
                    <ReferenceLine
                      key={`${m.date}-${m.label}`}
                      x={m.date}
                      stroke="hsl(280 65% 55%)"
                      strokeDasharray="5 5"
                      label={{ value: m.label, position: "top", fill: "var(--text-secondary)", fontSize: 10 }}
                    />
                  ))}
                </LineChart>
              </ChartCard>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
              <h2 className="text-sm font-semibold">Pre/post windows around promotions (90d)</h2>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                {overview?.promotionAttribution?.methodology ??
                  "Mean revisions in 7d before vs. after each promotion (global logs). Not a causal estimate."}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                      <th className="py-2 pr-3">Promoted</th>
                      <th className="py-2 pr-3">Test</th>
                      <th className="py-2 pr-3">Platform</th>
                      <th className="py-2 pr-3 text-right">Pre μ rev</th>
                      <th className="py-2 pr-3 text-right">Post μ rev</th>
                      <th className="py-2 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.promotionAttribution?.windows ?? []).map(
                      (w: {
                        promotionId: string;
                        promotedAt: string;
                        testName: string;
                        platform: string;
                        format: string;
                        preWindowAvgRevisions: number | null;
                        postWindowAvgRevisions: number | null;
                        delta: number | null;
                      }) => (
                        <tr key={w.promotionId} className="border-t border-[hsl(var(--border))]">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {new Date(w.promotedAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 max-w-[180px] truncate" title={w.testName}>
                            {w.testName}
                          </td>
                          <td className="py-2 pr-3">
                            {w.platform}/{w.format}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {w.preWindowAvgRevisions == null ? "—" : w.preWindowAvgRevisions.toFixed(3)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {w.postWindowAvgRevisions == null ? "—" : w.postWindowAvgRevisions.toFixed(3)}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {w.delta == null ? "—" : w.delta.toFixed(3)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
                {(overview?.promotionAttribution?.windows ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No promotions in the last 90 days.</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <ChartCard title="Daily Active Users (30d)">
                <LineChart data={overview?.dailyActiveUsersLast30d ?? []}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="activeUsers" stroke="var(--accent-primary)" />
                </LineChart>
              </ChartCard>
              <ChartCard title="Daily Design Volume (snapshot)">
                <BarChart data={overview?.dailyDesignVolumeByPlatformLast30d ?? []}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--accent-primary)" />
                </BarChart>
              </ChartCard>
              <ChartCard title="Daily Cost + 7d Average">
                <LineChart data={overview?.dailyCostTrendLast30d ?? []}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="totalCostUsd" stroke="hsl(214 100% 65%)" />
                  <Line type="monotone" dataKey="rolling7dAvg" stroke="var(--accent-primary)" />
                </LineChart>
              </ChartCard>
            </div>
          </div>
        ) : null}

        {tab === "promptScores" ? (
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-bold">Prompt Scores</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Distribution and scoring quality.</p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Platform</div>
                <input
                  className="h-10 w-44 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={promptFilters.platform ?? ""}
                  onChange={(e) => setPromptFilters((p) => ({ ...p, platform: e.target.value || undefined }))}
                  placeholder="all"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Format</div>
                <input
                  className="h-10 w-44 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={promptFilters.format ?? ""}
                  onChange={(e) => setPromptFilters((p) => ({ ...p, format: e.target.value || undefined }))}
                  placeholder="all"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Min uses</div>
                <input
                  type="number"
                  className="h-10 w-28 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={promptFilters.minUses}
                  onChange={(e) => setPromptFilters((p) => ({ ...p, minUses: Number(e.target.value ?? 0) }))}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
              <table className="min-w-full text-xs">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Platform</th>
                    <th className="px-3 py-2 text-left">Format</th>
                    <th className="px-3 py-2 text-left">Score</th>
                    <th className="px-3 py-2 text-left">Uses</th>
                    <th className="px-3 py-2 text-left">Zero Rev %</th>
                    <th className="px-3 py-2 text-left">Avg Revisions</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPromptScores.map((r: any) => (
                    <tr key={r.promptStructureHash} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2">{r.platform}</td>
                      <td className="px-3 py-2">{r.format}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              r.score >= 0.7
                                ? "text-[hsl(var(--success))] font-semibold"
                                : r.score >= 0.4
                                  ? "text-yellow-200 font-semibold"
                                  : "text-[hsl(var(--destructive))] font-semibold"
                            }
                          >
                            {Number(r.score ?? 0).toFixed(2)}
                          </span>
                          <div className="h-1.5 w-20 rounded bg-[hsl(var(--surface-elevated))]">
                            <div className="h-full rounded bg-[hsl(var(--accent))]" style={{ width: `${Math.max(0, Math.min(100, Number(r.score ?? 0) * 100))}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.totalUses}</td>
                      <td className="px-3 py-2">{r.zeroRevisionRate == null ? "-" : `${Number(r.zeroRevisionRate).toFixed(1)}%`}</td>
                      <td className="px-3 py-2">{r.avgRevisions == null ? "-" : Number(r.avgRevisions).toFixed(2)}</td>
                      <td className="px-3 py-2">{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                  {sortedPromptScores.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                        No prompt scores found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              {["platform", "format", "score", "totalUses", "zeroRevisionRate", "avgRevisions", "updatedAt"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className="rounded-[var(--radius)] bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs"
                  onClick={() => setPromptSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }))}
                >
                  Sort: {k} {promptSort.key === k ? (promptSort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              ))}
            </div>

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
              <div className="mb-2 text-sm font-semibold">Scatter (Zero Rev Rate vs Avg Revisions)</div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" name="Zero Rev %" />
                    <YAxis type="number" dataKey="y" name="Avg Revisions" />
                    <Tooltip />
                    <Scatter data={scatterData} fill="var(--accent-primary)" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
            <ChartCard title="Score Distribution">
              <BarChart data={scoreHistogram}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fill: "var(--text-secondary)" }} />
                <YAxis tick={{ fill: "var(--text-secondary)" }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--accent-primary)" />
              </BarChart>
            </ChartCard>
          </div>
        ) : null}

        {tab === "templates" ? (
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-bold">Template Performance</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Leaderboard and recommendations.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={templateMode === "top" ? "default" : "secondary"} onClick={() => setTemplateMode("top")}>
                Top performers
              </Button>
              <Button size="sm" variant={templateMode === "bottom" ? "default" : "secondary"} onClick={() => setTemplateMode("bottom")}>
                Bottom performers
              </Button>
            </div>

            {templatesPayload?.leaderboard?.length ? (
              <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                <table className="min-w-full text-xs">
                  <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                    <tr>
                      <th className="px-3 py-2 text-left">Template</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Platform</th>
                      <th className="px-3 py-2 text-left">Source</th>
                      <th className="px-3 py-2 text-left">Usage</th>
                      <th className="px-3 py-2 text-left">Approval Rate</th>
                      <th className="px-3 py-2 text-left">Avg Revisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templatesPayload.leaderboard
                      .slice()
                      .sort((a: any, b: any) =>
                        templateMode === "top" ? (b.avgApprovalRate ?? 0) - (a.avgApprovalRate ?? 0) : (a.avgApprovalRate ?? 0) - (b.avgApprovalRate ?? 0)
                      )
                      .map((r: any) => (
                        <tr key={r.templateId} className="border-t border-[hsl(var(--border))]">
                          <td className="px-3 py-2 font-semibold">{r.name}</td>
                          <td className="px-3 py-2">{r.category}</td>
                          <td className="px-3 py-2">{r.platform}</td>
                          <td className="px-3 py-2">{r.source ?? "-"}</td>
                          <td className="px-3 py-2">{r.usageCount}</td>
                          <td className="px-3 py-2">
                            {r.avgApprovalRate == null ? "-" : `${Number(r.avgApprovalRate).toFixed(1)}%`}
                          </td>
                          <td className="px-3 py-2">
                            {r.avgRevisionCountWhenUsed == null ? "-" : Number(r.avgRevisionCountWhenUsed).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
              <div className="mb-2 text-sm font-semibold">Template Recommendations</div>
              <div className="space-y-2">
                {(templatesPayload?.recommendations ?? []).map((rec: any) => (
                  <div key={rec.id} className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3">
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {rec.platform} • {rec.patternType} • freq {rec.frequency ?? "-"}
                    </div>
                    <div className="mt-1 text-sm">{rec.recommendation}</div>
                    {rec.status === "pending" ? (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            await fetch(`/api/analytics/admin/template-recommendations/${rec.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "applied" }),
                            });
                            void refreshTab("templates", { refresh: true });
                          }}
                        >
                          Mark as Applied
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await fetch(`/api/analytics/admin/template-recommendations/${rec.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "dismissed" }),
                            });
                            void refreshTab("templates", { refresh: true });
                          }}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Status: {rec.status}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "learning" ? (
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-bold">Learning Engine</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Effectiveness across cohorts.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">Users with active preferences</div>
                <div className="mt-2 text-2xl font-bold">{learning?.withPreferences?.avgRevisions?.toFixed?.(2) ?? "—"}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{learning?.withPreferences?.userCount ?? 0} users</div>
              </div>
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">Users without active preferences</div>
                <div className="mt-2 text-2xl font-bold">{learning?.withoutPreferences?.avgRevisions?.toFixed?.(2) ?? "—"}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{learning?.withoutPreferences?.userCount ?? 0} users</div>
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
              <div className="text-sm font-semibold">Improvement</div>
              <div className="mt-1 text-2xl font-bold">
                {learning?.improvementPercent == null ? "—" : `${Number(learning.improvementPercent).toFixed(1)}%`}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="First Preference Inference Distribution">
                <BarChart data={learning?.firstPreferenceHistogram ?? []}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="bucketDays" tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip />
                  <Bar dataKey="userCount" fill="var(--accent-primary)" />
                </BarChart>
              </ChartCard>
              <ChartCard title="Batch Duration Trend (30d)">
                <LineChart data={learning?.batchDurations30d ?? []}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="runDate" tick={{ fill: "var(--text-secondary)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="durationMs" stroke="var(--accent-primary)" />
                </LineChart>
              </ChartCard>
            </div>

            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
              <table className="min-w-full text-xs">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Pattern</th>
                    <th className="px-3 py-2 text-left">Frequency</th>
                    <th className="px-3 py-2 text-left">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {(learning?.globalRevisionPatterns ?? []).slice(0, 30).map((r: any, i: number) => (
                    <tr key={`${r.patternType}-${i}`} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2">{r.patternType}</td>
                      <td className="px-3 py-2">{r.frequency}</td>
                      <td className="px-3 py-2">{r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "costs" ? (
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-bold">Cost Analysis</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Model/platform cost and caching savings.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">Prompt caching savings</div>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  {costs?.promptCachingSavings ? (
                    <>
                      Savings: <span className="font-semibold text-[hsl(var(--foreground))]">${Number(costs.promptCachingSavings.savingsUsd ?? 0).toFixed(2)}</span>
                      <span className="ml-2 text-[hsl(var(--muted-foreground))]">
                        ({costs.promptCachingSavings.savingsPercent == null ? "N/A" : `${Number(costs.promptCachingSavings.savingsPercent).toFixed(1)}%`})
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">Cost Forecast (next 30d)</div>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Low: ${costForecast.low.toFixed(2)} • Medium: ${costForecast.medium.toFixed(2)} • High: ${costForecast.high.toFixed(2)}
                </div>
              </div>
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">By platform (30d)</div>
                <div className="mt-2 h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costs?.byPlatform ?? []}>
                      <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                      <XAxis dataKey="platform" tick={{ fill: "var(--text-secondary)" }} />
                      <YAxis tick={{ fill: "var(--text-secondary)" }} />
                      <Tooltip />
                      <Bar dataKey="totalCostUsd" fill="var(--accent-primary)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
              <div className="p-4">
                <div className="text-sm font-semibold">Cost by model (top)</div>
              </div>
              <table className="min-w-full text-xs">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Cost (USD)</th>
                    <th className="px-3 py-2 text-left">Tokens</th>
                    <th className="px-3 py-2 text-left">Avg cost/design</th>
                  </tr>
                </thead>
                <tbody>
                  {(costs?.byModel ?? []).slice(0, 10).map((r: any) => (
                    <tr key={r.model} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2">{r.model}</td>
                      <td className="px-3 py-2">${Number(r.totalCostUsd ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{r.totalTokens ?? 0}</td>
                      <td className="px-3 py-2">${Number(r.avgCostPerDesign ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(costs?.byModel?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                        No data
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
              <div className="p-4">
                <div className="text-sm font-semibold">Cost by user cohort</div>
              </div>
              <table className="min-w-full text-xs">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Cohort</th>
                    <th className="px-3 py-2 text-left">Cost (USD)</th>
                    <th className="px-3 py-2 text-left">Designs</th>
                    <th className="px-3 py-2 text-left">Avg cost/design</th>
                  </tr>
                </thead>
                <tbody>
                  {(costs?.byCohort ?? []).map((r: any) => (
                    <tr key={r.cohort} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2">{r.cohort}</td>
                      <td className="px-3 py-2">${Number(r.totalCostUsd ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{r.designs ?? 0}</td>
                      <td className="px-3 py-2">${Number(r.avgCostPerDesign ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
              <div className="p-4">
                <div className="text-sm font-semibold">Top 10 expensive calls</div>
              </div>
              <table className="min-w-full text-xs">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Platform</th>
                    <th className="px-3 py-2 text-left">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(costs?.top10ExpensiveCalls ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2">{r.userId ?? "-"}</td>
                      <td className="px-3 py-2">{r.model}</td>
                      <td className="px-3 py-2">{r.platform ?? "-"}</td>
                      <td className="px-3 py-2">${Number(r.costUsd ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(costs?.top10ExpensiveCalls?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                        No data
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "batch" ? (
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-bold">Batch Analytics</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Adoption, failure rate, and completion times.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <KpiCard label="Total Batch Jobs" value={batch?.totalBatchJobs ?? 0} />
              <KpiCard
                label="Anthropic Adoption (%)"
                value={batch?.anthropicBatchAdoptionRate ?? null}
                format="percentMaybe"
              />
              <KpiCard label="Avg Completion Time (ms)" value={batch?.avgBatchCompletionTimeMs ?? null} format="numberMaybe" />
              <KpiCard label="Failure Rate (%)" value={batch?.failureRate ?? null} format="percentMaybe" />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">Batch jobs trend (last 30d)</div>
                <div className="h-[280px] mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={batch?.batchTrendLast30d ?? []}>
                      <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)" }} />
                      <YAxis tick={{ fill: "var(--text-secondary)" }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="batchJobs" stroke="var(--accent-primary)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="text-sm font-semibold">Strategy split</div>
                <div className="h-[280px] mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip />
                      <Pie
                        data={(batch?.strategySplit ?? []).map((x: any) => ({
                          name: x.strategy,
                          value: x.count,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {(batch?.strategySplit ?? []).map((x: any, idx: number) => (
                          <Cell key={x.strategy} fill={idx === 0 ? "var(--accent-primary)" : "hsl(215 20% 60%)"} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "abTests" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">A/B Tests</h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Compare prompt strategies and template selection. Assignments are deterministic per user.
                </p>
              </div>
              <Button type="button" onClick={() => router.push("/admin/tests/new")}>
                Create test
              </Button>
            </div>

            {(abSuggestions ?? []).length ? (
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
                <div className="text-sm font-semibold">Suggested tests</div>
                <div className="mt-3 space-y-3">
                  {(abSuggestions ?? []).map((s: any) => (
                    <div
                      key={s.id}
                      className="flex flex-col gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                          {s.priority}
                        </div>
                        <p className="text-sm">{s.rationale}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => router.push("/admin/tests/new?suggestion=" + encodeURIComponent(s.id))}
                        >
                          Create from suggestion
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await fetch("/api/admin/ab-test-suggestions", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: s.id, status: "dismissed" }),
                            });
                            void refreshTab("abTests");
                          }}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))] overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Target</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(abTests ?? []).map((row: any) => (
                    <tr key={row.id} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                        {row.platform} / {row.format}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            row.status === "running"
                              ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--accent))]"
                              : row.status === "completed"
                                ? "bg-emerald-950/40 text-emerald-300"
                                : row.status === "cancelled"
                                  ? "bg-red-950/40 text-red-300"
                                  : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                        {row.startDate ? new Date(row.startDate).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/admin/tests/${row.id}`)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!(abTests ?? []).length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                        No tests yet. Create a draft or launch from the seed examples after running migrations.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "systemLogs" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">System Logs</h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Learning batch job history.</p>
              </div>
            </div>

            <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))] overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-3 py-2 text-left">Run date</th>
                    <th className="px-3 py-2 text-left">Job</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Duration</th>
                    <th className="px-3 py-2 text-left">Error</th>
                    <th className="px-3 py-2 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(systemLogs?.logs ?? []).map((r: any) => (
                    <FragmentLogRow
                      key={r.id}
                      row={r}
                      expanded={logsExpandedId === r.id}
                      onToggle={() => setLogsExpandedId((cur) => (cur === r.id ? null : r.id))}
                    />
                  ))}
                  {(systemLogs?.logs?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                        No logs yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button size="sm" variant="secondary" disabled={logsPage <= 1} onClick={() => setLogsPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Page {systemLogs?.page ?? logsPage} • Total {systemLogs?.total ?? 0}
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={(systemLogs?.page ?? 1) * (systemLogs?.pageSize ?? 20) >= (systemLogs?.total ?? 0)}
                onClick={() => setLogsPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function KpiCard({ label, value, format }: { label: string; value: any; format?: "cost" | "costMaybe" | "percentMaybe" | "numberMaybe" | "scoreMaybe" }) {
  const v = value ?? 0;
  const formatted =
    format === "cost"
      ? `$${Number(v).toFixed(2)}`
      : format === "costMaybe"
        ? value == null
          ? "—"
          : `$${Number(v).toFixed(2)}`
        : format === "percentMaybe"
          ? value == null
            ? "—"
            : `${Number(v).toFixed(1)}%`
          : format === "scoreMaybe"
            ? value == null
              ? "—"
              : Number(v).toFixed(2)
            : format === "numberMaybe"
              ? value == null
                ? "—"
                : Number(v).toLocaleString()
              : typeof v === "number"
                ? v.toLocaleString()
                : String(v);

  return (
    <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="mt-2 text-2xl font-bold">{formatted}</div>
    </div>
  );
}

function FragmentLogRow({ row, expanded, onToggle }: { row: any; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-[hsl(var(--border))]">
        <td className="px-3 py-2">{row.runDate}</td>
        <td className="px-3 py-2">{row.jobName}</td>
        <td className="px-3 py-2">{row.status}</td>
        <td className="px-3 py-2">{row.durationMs}ms</td>
        <td className="px-3 py-2">{row.errorMessage ?? "-"}</td>
        <td className="px-3 py-2 text-right">
          <button type="button" className="text-[hsl(var(--accent))] hover:underline" onClick={onToggle}>
            {expanded ? "Hide" : "Show"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="px-3 py-2 bg-[hsl(var(--surface-elevated))]">
            <AuditDetails details={row.auditDetails ?? {}} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AuditDetails({ details }: { details: any }) {
  if (details == null) return <div className="text-xs text-[hsl(var(--muted-foreground))]">No details</div>;
  if (typeof details !== "object") return <div className="text-xs">{String(details)}</div>;
  const entries = Object.entries(details);
  return (
    <div className="max-h-96 overflow-auto space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded border border-[hsl(var(--border))] p-2">
          <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{k}</div>
          <div className="mt-1 text-xs text-[hsl(var(--foreground))]">{typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}</div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

