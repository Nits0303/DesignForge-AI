"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Clock, Download, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { REVISION_SUGGESTIONS, DEFAULT_REVISION_SUGGESTIONS } from "@/constants/revisionSuggestions";

type BatchItemStatus = "pending" | "generating" | "complete" | "failed" | "approved" | "revision_requested";

function parseSseChunk(chunk: string) {
  const events: { event: string; data: any }[] = [];
  const rawEvents = chunk.split("\n\n").filter(Boolean);
  for (const raw of rawEvents) {
    const lines = raw.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!eventLine || !dataLine) continue;
    try {
      events.push({
        event: eventLine.replace("event:", "").trim(),
        data: JSON.parse(dataLine.replace("data:", "").trim()),
      });
    } catch {
      // ignore
    }
  }
  return events;
}

export default function BatchReviewPage() {
  const params = useParams<{ id: string }>();
  const batchId = params?.id;
  const router = useRouter();

  const [batch, setBatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costSummary, setCostSummary] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);

  const [statusFilter, setStatusFilter] = useState<BatchItemStatus | "all">("all");
  const [sortKey, setSortKey] = useState<"itemIndex" | "date" | "topic">("itemIndex");

  const [revisionOpenItemId, setRevisionOpenItemId] = useState<string | null>(null);
  const [revisionDraft, setRevisionDraft] = useState<string>("");

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [exportFormatMode, setExportFormatMode] = useState<"png" | "jpg" | "mixed">("mixed");
  const [exportKind, setExportKind] = useState<"mixed" | "image" | "pdf" | "code" | "figma">("mixed");
  const [exportFilenameConvention, setExportFilenameConvention] = useState<"by_platform" | "by_date" | "all_in_one">("by_platform");
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<any>(null);
  const [exportWorking, setExportWorking] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    if (!batchId) return;
    setError(null);
    try {
      const res = await fetch(`/api/batch/${batchId}`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Failed to load batch");
      setBatch(json.data ?? json);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to load batch");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    refresh();
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      refresh();
    }, 3000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    (async () => {
      try {
        const [costRes, metricsRes] = await Promise.all([
          fetch(`/api/batch/${batchId}/cost-summary`),
          fetch(`/api/batch/${batchId}/metrics`),
        ]);
        const [costJson, metricsJson] = await Promise.all([costRes.json(), metricsRes.json()]);
        if (cancelled) return;
        if (costRes.ok && costJson?.success) setCostSummary(costJson.data ?? costJson);
        if (metricsRes.ok && metricsJson?.success) setMetrics(metricsJson.data ?? metricsJson);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const items: any[] = batch?.items ?? [];

  const filteredItems = useMemo(() => {
    const base = statusFilter === "all" ? items : items.filter((it) => it.status === statusFilter);
    const sorted = [...base];
    if (sortKey === "itemIndex") sorted.sort((a, b) => (a.itemIndex ?? 0) - (b.itemIndex ?? 0));
    if (sortKey === "topic") sorted.sort((a, b) => String(a.topic ?? "").localeCompare(String(b.topic ?? "")));
    if (sortKey === "date") sorted.sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
    return sorted;
  }, [items, statusFilter, sortKey]);

  // Lightweight virtualized grid: render only visible “rows” to keep the UI responsive on big batches.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [gridCols, setGridCols] = useState(3);

  const CARD_HEIGHT = 560;
  const ROW_GAP = 16; // matches `gap-4`
  const ROW_HEIGHT = CARD_HEIGHT + ROW_GAP;
  const OVERSCAN_ROWS = 1;

  useEffect(() => {
    const updateCols = () => {
      const w = window.innerWidth;
      if (w >= 1024) setGridCols(3);
      else if (w >= 640) setGridCols(2);
      else setGridCols(1);
    };
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const canApproveItem = (it: any) => it.status === "complete" || it.status === "revision_requested";

  const approveItems = async (itemIds?: string[]) => {
    if (!batchId) return;
    await fetch(`/api/batch/${batchId}/approve-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemIds ? { itemIds } : { approveAll: true }),
    });
    await refresh();
  };

  const removeItems = async (itemIds: string[]) => {
    if (!batchId) return;
    await fetch(`/api/batch/${batchId}/remove-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds }),
    });
    await refresh();
  };

  const startRevision = async (it: any) => {
    if (!batchId || !it?.designId) return;
    const revisionPrompt = revisionDraft.trim();
    if (revisionPrompt.length < 4) return;

    setRevisionOpenItemId(null);
    setRevisionDraft("");

    // Mark item as revision requested (so UI shows it)
    await fetch(`/api/batch/${batchId}/items/${it.id}/revision-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionPrompt }),
    });

    // Run SSE revision.
    try {
      const res = await fetch("/api/design/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: it.designId,
          revisionPrompt,
          slideIndex: undefined,
          referenceImageUrl: undefined,
          referenceIds: undefined,
          referenceRoles: undefined,
        }),
      });
      if (!res.body) throw new Error("No SSE body returned");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = parseSseChunk(buf);
        const lastBoundary = buf.lastIndexOf("\n\n");
        if (lastBoundary >= 0) buf = buf.slice(lastBoundary + 2);

        for (const evt of events) {
          if (evt.event === "complete") {
            // Mark batch item back to complete for grid rendering
            await fetch(`/api/batch/${batchId}/items/${it.id}/revision-complete`, { method: "POST" });
            await refresh();
            return;
          }
        }
      }
    } catch {
      // If revision fails, we still refresh and show the grid state on next poll.
      await refresh();
    }
  };

  const exportApproved = async () => {
    if (!batchId) return;
    setExportWorking(true);
    setExportJobId(null);
    setExportStatus(null);
    try {
      const res = await fetch(`/api/export/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchJobId: batchId,
          exportKind,
          formatMode: exportFormatMode,
          filenameConvention: exportFilenameConvention,
          itemIds: selectedItemIds.length ? selectedItemIds : undefined,
          jpgQuality: 90,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Bulk export failed");
      setExportJobId(json.data?.jobId);
      setExportStatus({ status: "processing", processed: 0, total: 0 });
    } catch (e: any) {
      setExportStatus({ status: "failed", errorMessage: e?.message ? String(e.message) : "Export failed" });
    } finally {
      setExportWorking(false);
    }
  };

  useEffect(() => {
    if (!exportDialogOpen) return;
    if (!exportJobId) return;

    let cancelled = false;
    let t: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const res = await fetch(`/api/export/bulk-status/${exportJobId}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success) {
          setExportStatus(json.data ?? json);
          if (json.data?.status === "complete" && json.data?.zipUrl) {
            setTimeout(() => {
              if (cancelled) return;
              const a = document.createElement("a");
              a.href = json.data.zipUrl;
              a.download = `batch_export_${batchId}.zip`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setExportDialogOpen(false);
            }, 500);
            if (t) clearInterval(t);
          }
          if (json.data?.status === "failed") {
            if (t) clearInterval(t);
          }
        }
      } catch {}
    };
    tick();
    t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      if (t) clearInterval(t);
    };
  }, [exportDialogOpen, exportJobId, batchId]);

  const batchStatus = batch?.batchJob?.status ?? batch?.status ?? "pending";
  const jobName = batch?.batchJob?.name ?? batch?.name ?? "Batch";
  const progress = batch?.progress ?? null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Batch</div>
          <h1 className="text-2xl font-bold">{jobName}</h1>
          <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Status: <span className="font-semibold">{batchStatus}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/batch")}>
            Back
          </Button>
          <Button variant="secondary" onClick={() => approveItems()}>
            Approve All
          </Button>
          {selectedItemIds.length ? (
            <>
              <Button variant="secondary" onClick={() => approveItems(selectedItemIds)}>
                Approve selected ({selectedItemIds.length})
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await removeItems(selectedItemIds);
                  setSelectedItemIds([]);
                }}
              >
                Remove selected
              </Button>
            </>
          ) : null}
          <Button variant="secondary" onClick={() => setExportDialogOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Export {selectedItemIds.length ? "selected" : "approved"}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (!batchId) return;
              await fetch(`/api/batch/${batchId}/cancel`, { method: "POST" });
              await refresh();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>

      {costSummary ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Actual cost</div>
            <div className="mt-1 text-2xl font-bold">${Number(costSummary.totalCostUsd ?? 0).toFixed(2)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Estimated</div>
            <div className="mt-1 text-2xl font-bold">
              ${Number(costSummary.estimatedCostUsd ?? 0).toFixed(2)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Batch API savings</div>
            <div className="mt-1 text-2xl font-bold">${Number(costSummary.savingsFromBatchApi ?? 0).toFixed(2)}</div>
          </Card>
        </div>
      ) : null}

      {metrics ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Throughput (designs/hour)</div>
            <div className="mt-1 text-2xl font-bold">{Number(metrics.throughputPerHour ?? 0).toFixed(1)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Processing time</div>
            <div className="mt-1 text-2xl font-bold">
              {metrics.processingMs != null ? `${Math.max(0, Math.round(Number(metrics.processingMs) / 1000))}s` : "—"}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Status counts</div>
            <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {metrics.statusCounts
                ? Object.entries(metrics.statusCounts)
                    .map(([k, v]) => `${v} ${k}`)
                    .slice(0, 4)
                    .join(" · ")
                : "—"}
            </div>
          </Card>
        </div>
      ) : null}

      {progress ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <div>{progress.percentComplete}% complete</div>
            <div>{progress.currentlyProcessing} running</div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--border))]">
            <div
              className="h-full bg-[hsl(var(--accent))]"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["all", "pending", "generating", "complete", "failed", "approved", "revision_requested"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "secondary" : "ghost"}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[hsl(var(--muted-foreground))]">Sort</span>
          <select
            className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as any)}
          >
            <option value="itemIndex">Item index</option>
            <option value="date">Date</option>
            <option value="topic">Topic</option>
          </select>
        </div>
      </div>

      {loading ? <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div> : null}
      {error ? (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardHeader className="p-4">
            <CardTitle className="text-sm text-red-200">{error}</CardTitle>
          </CardHeader>
        </Card>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="max-h-[740px] overflow-auto pr-2"
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        {!filteredItems.length ? (
          <Card className="p-5 text-sm text-[hsl(var(--muted-foreground))]">
            No items match the current filter.
          </Card>
        ) : (
          (() => {
            const rowCount = Math.ceil(filteredItems.length / gridCols);
            const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
            const endRow = Math.min(rowCount, startRow + Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2);

            const gridClass =
              gridCols === 3 ? "grid grid-cols-3 gap-4" : gridCols === 2 ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4";

            const previewHeight = 280;

            const rowEls: any[] = [];
            for (let r = startRow; r < endRow; r++) {
              const rowItems = filteredItems.slice(r * gridCols, r * gridCols + gridCols);
              rowEls.push(
                <div
                  key={r}
                  style={{
                    position: "absolute",
                    top: r * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    paddingRight: 0,
                  }}
                >
                  <div className={gridClass}>
                    {rowItems.map((it: any) => {
                      const status = it.status as BatchItemStatus;
                      const previewUrl = it.design?.previewUrl ?? null;
                      const title = it.design?.title ?? it.topic ?? "Untitled";

                      return (
                        <Card key={it.id} className="flex h-[560px] flex-col overflow-hidden p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedItemIds.includes(it.id)}
                                disabled={status === "pending" || status === "generating"}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedItemIds((prev) => {
                                    if (checked) return prev.concat(it.id);
                                    return prev.filter((x) => x !== it.id);
                                  });
                                }}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{title}</div>
                                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                                  {it.platform}/{it.format} • {it.date}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {status === "approved" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                              ) : status === "failed" ? (
                                <AlertTriangle className="h-4 w-4 text-red-400" />
                              ) : status === "generating" ? (
                                <Clock className="h-4 w-4 text-[hsl(var(--accent))]" />
                              ) : (
                                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{status}</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3">
                            {status === "complete" || status === "approved" ? (
                              <div
                                className="w-full overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]"
                                style={{ height: previewHeight }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewUrl ?? ""} alt={title} className="h-full w-full object-cover" />
                              </div>
                            ) : status === "failed" ? (
                              <div
                                className="rounded-[var(--radius)] border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200"
                                style={{ height: previewHeight }}
                              >
                                {it.errorMessage ?? "Failed"}
                              </div>
                            ) : status === "revision_requested" ? (
                              <div
                                className="rounded-[var(--radius)] border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-200"
                                style={{ height: previewHeight }}
                              >
                                Revision requested…
                              </div>
                            ) : (
                              <div
                                className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4 text-xs text-[hsl(var(--muted-foreground))]"
                                style={{ height: previewHeight }}
                              >
                                {status === "pending" ? "Queued…" : "Generating…"}
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex-1 space-y-2 overflow-hidden text-xs">
                            <div className="flex flex-wrap gap-2">
                              {status === "complete" ? (
                                <Button size="sm" onClick={() => approveItems([it.id])}>
                                  Approve
                                </Button>
                              ) : null}
                              {status === "approved" ? (
                                <Button size="sm" variant="secondary" disabled>
                                  Approved
                                </Button>
                              ) : null}
                              {canApproveItem(it) && status !== "approved" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setRevisionOpenItemId(it.id);
                                    setRevisionDraft("");
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Revise
                                </Button>
                              ) : null}
                              {status === "failed" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={async () => {
                                    await fetch(`/api/batch/${batchId}/retry-failed`, { method: "POST" });
                                    await refresh();
                                  }}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Retry
                                </Button>
                              ) : null}
                              {status !== "pending" && status !== "generating" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (!confirm("Remove this item from the batch?")) return;
                                    await removeItems([it.id]);
                                  }}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Remove
                                </Button>
                              ) : null}
                            </div>

                            {revisionOpenItemId === it.id ? (
                              <div className="space-y-2 overflow-auto">
                                <Textarea
                                  value={revisionDraft}
                                  onChange={(e) => setRevisionDraft(e.target.value)}
                                  placeholder="Write a revision request…"
                                />
                                <div className="flex flex-wrap gap-2">
                                  {(((REVISION_SUGGESTIONS as any)[String(it.platform ?? "").toLowerCase()] as
                                    | string[]
                                    | undefined) ?? DEFAULT_REVISION_SUGGESTIONS).slice(0, 4).map((s) => (
                                    <Button
                                      key={s}
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => setRevisionDraft((prev) => (prev ? `${prev}\n- ${s}` : s))}
                                    >
                                      {s}
                                    </Button>
                                  ))}
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setRevisionOpenItemId(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button size="sm" onClick={() => startRevision(it)}>
                                    Submit Revision
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div style={{ height: rowCount * ROW_HEIGHT, position: "relative" }}>
                {rowEls}
              </div>
            );
          })()
        )}
      </div>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-xl">
          <div className="space-y-3">
            <div className="text-sm font-semibold">Export Approved Designs</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Creates a ZIP and downloads it once ready.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Export type</div>
                <select
                  className="h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={exportKind}
                  onChange={(e) => setExportKind(e.target.value as any)}
                >
                  <option value="mixed">Mixed (PDF + images)</option>
                  <option value="pdf">PDF</option>
                  <option value="image">Images (PNG/JPG)</option>
                  <option value="code">Code (HTML/CSS zip)</option>
                  <option value="figma">Figma links (manifest)</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Format</div>
                <select
                  className="h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={exportFormatMode}
                  onChange={(e) => setExportFormatMode(e.target.value as any)}
                >
                  <option value="mixed">Mixed (web=PDF, socials=PNG)</option>
                  <option value="png">PNG (socials)</option>
                  <option value="jpg">JPG (socials)</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Folder convention</div>
                <select
                  className="h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={exportFilenameConvention}
                  onChange={(e) => setExportFilenameConvention(e.target.value as any)}
                >
                  <option value="by_platform">By platform</option>
                  <option value="by_date">By date</option>
                  <option value="all_in_one">All in one folder</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button onClick={exportApproved} disabled={exportWorking}>
                {exportWorking ? "Starting…" : "Start export"}
              </Button>
              <Button variant="secondary" onClick={() => setExportDialogOpen(false)}>
                Close
              </Button>
            </div>

            {exportJobId ? (
              <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3 text-xs">
                <div className="font-semibold">Progress</div>
                <div className="mt-1">
                  {exportStatus?.status ?? "processing"} • {exportStatus?.processed ?? 0}/{exportStatus?.total ?? 0}
                </div>
                {exportStatus?.errorMessage ? (
                  <div className="mt-2 text-red-200">Error: {exportStatus.errorMessage}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

