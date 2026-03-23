"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";

function statusBadge(status: string) {
  switch (status) {
    case "processing":
      return "border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]";
    case "completed":
      return "border border-green-500/40 bg-green-500/10 text-green-200";
    case "partial":
      return "border border-yellow-500/40 bg-yellow-500/10 text-yellow-200";
    case "failed":
      return "border border-red-500/40 bg-red-500/10 text-red-200";
    case "cancelled":
      return "border border-[hsl(var(--border))] bg-[hsl(var(--muted-foreground))]/10 text-[hsl(var(--muted-foreground))]";
    default:
      return "border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]";
  }
}

export default function BatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = 20;
  const skip = (page - 1) * limit;

  const [active, setActive] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [activeRes, jobsRes] = await Promise.all([
        fetch("/api/batch?status=processing&page=1&limit=1"),
        fetch(`/api/batch?page=${page}&limit=${limit}`),
      ]);
      const [activeJson, jobsJson] = await Promise.all([activeRes.json(), jobsRes.json()]);
      if (!mounted) return;
      if (activeRes.ok && activeJson?.success) {
        setActive(activeJson.data?.jobs?.[0] ?? null);
      }
      if (jobsRes.ok && jobsJson?.success) {
        setJobs(jobsJson.data?.jobs ?? []);
        setTotalCount(Number(jobsJson.data?.total ?? 0));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [page]);

  const stats = useMemo(
    () =>
      jobs.length
        ? (() => {
        const totalCompleted = jobs.reduce((a, j) => a + (j.completedItems ?? 0), 0);
        const avgBatchSize = jobs.length ? jobs.reduce((a, j) => a + (j.totalItems ?? 0), 0) / jobs.length : 0;
        const saved = jobs.reduce((a, j) => {
          if (j.processingStrategy !== "anthropic_batch") return a;
          const est = j.estimatedCostUsd ?? 0;
          const act = j.actualCostUsd ?? 0;
          return a + Math.max(0, est - act);
        }, 0);
        return { totalCompleted, avgBatchSize, saved };
          })()
        : { totalCompleted: 0, avgBatchSize: 0, saved: 0 },
    [jobs]
  );

  return (
    <AdminSectionErrorBoundary title="Batch generation">
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Batch Generation</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Generate multiple designs from your content calendar.</p>
        </div>
        <Link href="/batch/new">
          <Button>New Batch</Button>
        </Link>
      </div>

      {active ? (
        <Link href={`/batch/${active.id}`} className="block">
          <Card className="p-4">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Active batch</div>
            <div className="mt-1 text-lg font-semibold">
              {active.name} is generating — {active.completedItems}/{active.totalItems} complete
            </div>
          </Card>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Total designs generated via batch</div>
          <div className="mt-2 text-2xl font-bold">{stats.totalCompleted}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Average batch size</div>
          <div className="mt-2 text-2xl font-bold">{stats.avgBatchSize.toFixed(1)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Total cost saved via Batch API</div>
          <div className="mt-2 text-2xl font-bold">${stats.saved.toFixed(2)}</div>
        </Card>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
          <div className="col-span-4">Batch</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Items</div>
          <div className="col-span-2">Strategy</div>
          <div className="col-span-1">Cost</div>
          <div className="col-span-1">Actions</div>
        </div>

        <div className="divide-y divide-[hsl(var(--border))]">
          {jobs.map((j) => {
            const platforms: Record<string, number> = {};
            const data = j.inputData as any;
            const items = Array.isArray(data) ? data : [];
            for (const it of items) {
              const p = String(it.platform ?? "").toLowerCase();
              if (!p) continue;
              platforms[p] = (platforms[p] ?? 0) + 1;
            }
            const topPlatforms = Object.entries(platforms)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([p]) => p);

            return (
              <div key={j.id} className="grid grid-cols-12 gap-2 px-4 py-4 text-sm">
                <div className="col-span-4">
                  <div className="font-semibold">{j.name}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {topPlatforms.length ? topPlatforms.join(", ") : "—"}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadge(j.status)}`}>{j.status}</span>
                </div>
                <div className="col-span-2">
                  {j.completedItems}/{j.totalItems} designs · {j.failedItems} failed
                </div>
                <div className="col-span-2">
                  {j.processingStrategy === "sequential" ? "Sequential" : j.processingStrategy === "parallel" ? "Parallel" : "Batch API"}
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    ${Number(j.estimatedCostUsd ?? 0).toFixed(2)} est.
                  </span>
                  <div className="text-xs">${Number(j.actualCostUsd ?? 0).toFixed(2)} actual</div>
                </div>
                <div className="col-span-1 flex items-center justify-end">
                  <Link href={`/batch/${j.id}`}>
                    <Button size="sm" variant="secondary">
                      Review
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {totalCount > limit ? (
        <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <div>Page {page}</div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button size="sm" variant="secondary" onClick={() => router.push(`/batch?page=${page - 1}`)}>
                Prev
              </Button>
            ) : null}
            {skip + limit < totalCount ? (
              <Button size="sm" variant="secondary" onClick={() => router.push(`/batch?page=${page + 1}`)}>
                Next
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
    </AdminSectionErrorBoundary>
  );
}


