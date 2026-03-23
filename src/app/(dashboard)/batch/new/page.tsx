"use client"; 

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseContentCalendar, parseContentCalendarFromCsv, parseContentCalendarFromJson, parseContentCalendarFromText, type BatchCalendarParseResult, estimateBatchCostUsd } from "@/lib/batch/contentCalendarParser";
import { PREFERENCE_LABELS } from "@/constants/preferenceLabels";
import { PLATFORM_SPECS } from "@/constants/platforms";
import { useUIStore } from "@/store/useUIStore";

const PLATFORM_OPTIONS = Object.keys(PLATFORM_SPECS);

type Step = 1 | 2 | 3 | 4;
type ImportMode = "csv" | "json" | "text";

function summarizeParse(result: BatchCalendarParseResult | null) {
  if (!result) return null;
  const total = result.items.length;
  const distEntries = Object.entries(result.summary.platformDistribution ?? {}).sort((a, b) => b[1] - a[1]);
  const dist = distEntries.map(([p, c]) => `${c} ${p}`).join(", ");
  return { total, dist };
}

function suggestedBatchName(items: any[], processingStrategy: string) {
  if (!items?.length) return "New Batch";
  const platforms = Array.from(new Set(items.map((x) => x.platform))).sort();
  const months = Array.from(
    new Set(
      items
        .map((x) => String(x.date ?? "").slice(0, 7))
        .filter((d) => /^\d{4}-\d{2}$/.test(d))
    )
  );
  const month = months[0] ? months[0] : "";
  const plat = platforms.length === 1 ? platforms[0] : `${platforms.length} platforms`;
  const strategySuffix = processingStrategy === "anthropic_batch" ? " (Batch API)" : "";
  return month ? `${month} ${plat} Calendar${strategySuffix}` : `${plat} Batch${strategySuffix}`;
}

function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return arr;
  const copy = [...arr];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

export default function BatchNewPage() {
  const { enqueueToast } = useUIStore((s) => s);

  const [step, setStep] = useState<Step>(1);
  const [importMode, setImportMode] = useState<ImportMode>("csv");

  const [csvText, setCsvText] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>("");
  const [plainText, setPlainText] = useState<string>("");

  const [parseResult, setParseResult] = useState<BatchCalendarParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Manual mode (we will still validate using the parsedResult pipeline)
  const [manualItems, setManualItems] = useState<
    Array<{ topic: string; date: string; platform: string; format: string; notes?: string; referenceImageUrl?: string }>
  >([]);

  const [orderedItems, setOrderedItems] = useState<any[]>([]);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);

  const [jobName, setJobName] = useState<string>("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [processingStrategy, setProcessingStrategy] = useState<"anthropic_batch" | "sequential" | "parallel">("sequential");

  const [brands, setBrands] = useState<any[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingBrands(true);
        const res = await fetch("/api/brands");
        const json = await res.json();
        if (!cancelled && json?.success) setBrands(json.data ?? []);
      } catch {}
      finally {
        if (!cancelled) setLoadingBrands(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!parseResult) return;
    if (jobName) return;
    setJobName(suggestedBatchName(parseResult.items as any[], processingStrategy));
  }, [parseResult, processingStrategy, jobName]);

  useEffect(() => {
    if (!parseResult?.items) return;
    // Initialize ordered items from parsed data.
    setOrderedItems(parseResult.items as any[]);
  }, [parseResult]);

  const estimatedCost = useMemo(() => estimateBatchCostUsd(orderedItems as any), [orderedItems]);

  const savingsVsStandard = useMemo(() => {
    if (processingStrategy !== "anthropic_batch") return 0;
    return estimatedCost * 0.5;
  }, [processingStrategy, estimatedCost]);

  const runParse = (mode: ImportMode) => {
    setParseError(null);
    try {
      if (mode === "csv") {
        const result = parseContentCalendar({ mode: "csv", input: csvText ?? "" });
        setParseResult(result);
      } else if (mode === "json") {
        const result = parseContentCalendar({ mode: "json", input: jsonText ?? "" });
        setParseResult(result);
      } else {
        const result = parseContentCalendar({ mode: "text", input: plainText ?? "" });
        setParseResult(result);
      }
    } catch (e: any) {
      setParseError(e?.message ? String(e.message) : "Failed to parse input.");
      setParseResult(null);
    }
  };

  useEffect(() => {
    // Don’t auto-parse on empty input.
    if (step !== 2) return;
    if (importMode === "csv" && !csvText.trim()) return;
    if (importMode === "json" && !jsonText.trim()) return;
    if (importMode === "text" && !plainText.trim()) return;
    runParse(importMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, importMode]);

  const validationSummary = summarizeParse(parseResult);

  const startGeneration = async () => {
    const itemsToSubmit = (orderedItems?.length ? orderedItems : parseResult?.items) as any[] | undefined;
    if (!itemsToSubmit?.length) {
      enqueueToast({ title: "Nothing to generate", description: "No valid items found in your input.", type: "error" });
      return;
    }
    try {
      const res = await fetch("/api/batch/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: jobName,
          brandId: brandId ?? undefined,
          items: itemsToSubmit,
          processingStrategy,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Failed to create batch");
      const id = json.data?.batchJob?.id ?? json.data?.batchJobId ?? json.batchJob?.id;
      if (typeof json?.data?.skippedCount === "number" && json.data.skippedCount > 0) {
        enqueueToast({
          title: "Duplicate rows skipped",
          description: `${json.data.skippedCount} item(s) were skipped to avoid near-duplicates.`,
          type: "info",
        });
      }
      enqueueToast({ title: "Batch started", description: `Your batch is now processing.`, type: "success" });
      window.location.href = `/batch/${id}`;
    } catch (e: any) {
      enqueueToast({ title: "Batch start failed", description: e?.message ? String(e.message) : "Unknown error", type: "error" });
    }
  };

  const addManualRow = () => {
    setManualItems((prev) => [
      ...prev,
      { topic: "", date: new Date().toISOString().slice(0, 10), platform: "instagram", format: PLATFORM_SPECS.instagram.supportedFormats[0] },
    ]);
  };

  const manualParseResult = useMemo(() => {
    if (!manualItems.length) return null;
    // Minimal validation: map manual rows to parser output shape.
    const items = manualItems
      .filter((x) => x.topic.trim())
      .map((x) => ({ ...x, platform: x.platform as any, notes: x.notes, referenceImageUrl: x.referenceImageUrl }));
    const errors: any[] = [];
    for (let i = 0; i < manualItems.length; i++) {
      const r = manualItems[i]!;
      if (!r.topic.trim()) errors.push({ row: i + 1, message: "Missing topic" });
      if (!r.date.trim()) errors.push({ row: i + 1, message: "Missing date" });
      if (!r.platform.trim()) errors.push({ row: i + 1, message: "Missing platform" });
    }
    const summary = {
      platformDistribution: items.reduce((acc: Record<string, number>, it: any) => {
          acc[String(it.platform).toLowerCase()] = (acc[String(it.platform).toLowerCase()] ?? 0) + 1;
          return acc;
        }, {}),
      dateRange: undefined,
      estimatedCostUsd: estimateBatchCostUsd(items as any),
    };
    return { items: items as any, errors, warnings: [], summary };
  }, [manualItems]);

  const activeParse = parseResult ?? manualParseResult;

  useEffect(() => {
    if (!manualParseResult?.items?.length) return;
    if (step !== 2) return;
    setOrderedItems(manualParseResult.items as any[]);
  }, [manualParseResult, step]);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">New Batch</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Generate dozens of designs from a content calendar.</p>
      </div>

      <div className="flex gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`rounded-full border px-3 py-1 ${step === s ? "border-[hsl(var(--accent))]" : "border-[hsl(var(--border))]"}`}
          >
            Step {s}
          </button>
        ))}
      </div>

      {step === 1 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <CardHeader className="p-0">
              <CardTitle className="text-base">Upload a content calendar</CardTitle>
            </CardHeader>
            <CardContent className="p-0 mt-2">
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Import your content plan from a spreadsheet. Download our template to get started.
              </div>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    window.location.href = "/api/batch/template-csv";
                  }}
                >
                  Download template
                </Button>
              </div>
              <div className="mt-4 rounded-[var(--radius)] border border-dashed border-[hsl(var(--border))] p-4 text-sm">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    setImportMode("csv");
                    setCsvText(text);
                    setParseResult(null);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="p-5">
            <CardHeader className="p-0">
              <CardTitle className="text-base">Build manually</CardTitle>
            </CardHeader>
            <CardContent className="p-0 mt-2">
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Add items one by one using a form. Best for smaller batches.
              </div>
              <div className="mt-3">
                <Button onClick={addManualRow} variant="secondary">
                  Add item
                </Button>
              </div>
              {manualItems.length ? (
                <div className="mt-4 space-y-3">
                  {manualItems.map((r, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-2">
                      <Input
                        value={r.topic}
                        onChange={(e) => {
                          setManualItems((prev) => prev.map((x, i) => (i === idx ? { ...x, topic: e.target.value } : x)));
                        }}
                        placeholder="Topic"
                      />
                      <Input
                        type="date"
                        value={r.date}
                        onChange={(e) => {
                          setManualItems((prev) => prev.map((x, i) => (i === idx ? { ...x, date: e.target.value } : x)));
                        }}
                      />
                      <select
                        className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                        value={r.platform}
                        onChange={(e) => {
                          const platform = e.target.value;
                          const formats = (PLATFORM_SPECS as any)[platform]?.supportedFormats ?? [];
                          setManualItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, platform, format: formats[0] ?? x.format } : x))
                          );
                        }}
                      >
                        {PLATFORM_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                        value={r.format}
                        onChange={(e) => {
                          setManualItems((prev) => prev.map((x, i) => (i === idx ? { ...x, format: e.target.value } : x)));
                        }}
                      >
                        {(PLATFORM_SPECS as any)[r.platform]?.supportedFormats?.map((f: string) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      <div className="col-span-2">
                        <Textarea
                          value={r.notes ?? ""}
                          onChange={(e) => {
                            setManualItems((prev) => prev.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)));
                          }}
                          placeholder="Notes (optional)"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setManualItems((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="md:col-span-2">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Paste CSV text (alternative)</div>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste CSV content here…"
              className="mt-2"
            />
            <div className="mt-2 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setImportMode("csv");
                  setParseResult(null);
                }}
              >
                Use pasted CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setImportMode("json");
                }}
              >
                Switch to JSON (in Step 2)
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setImportMode("text");
                }}
              >
                Switch to Text (in Step 2)
              </Button>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={
                (!csvText.trim() && !jsonText.trim() && !plainText.trim() && !manualItems.length) ||
                (importMode === "csv" && !csvText.trim() && !manualItems.length)
              }
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Validation</div>
            <div className="flex gap-2">
              <Button variant={importMode === "csv" ? "secondary" : "ghost"} onClick={() => setImportMode("csv")}>
                CSV
              </Button>
              <Button variant={importMode === "json" ? "secondary" : "ghost"} onClick={() => setImportMode("json")}>
                JSON
              </Button>
              <Button variant={importMode === "text" ? "secondary" : "ghost"} onClick={() => setImportMode("text")}>
                Text
              </Button>
            </div>
          </div>

          {importMode === "csv" ? (
            <div className="space-y-2">
              <Textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="CSV content…" />
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => runParse("csv")}>
                  Parse CSV
                </Button>
              </div>
            </div>
          ) : null}

          {importMode === "json" ? (
            <div className="space-y-2">
              <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder="Paste JSON import…" />
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => runParse("json")}>
                  Parse JSON
                </Button>
              </div>
            </div>
          ) : null}

          {importMode === "text" ? (
            <div className="space-y-2">
              <Textarea value={plainText} onChange={(e) => setPlainText(e.target.value)} placeholder={`Example:\nMarch 2 | instagram | Monday motivation post`} />
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => runParse("text")}>
                  Parse Text
                </Button>
              </div>
            </div>
          ) : null}

          {parseError ? (
            <Card className="border-red-500/40 bg-red-500/10">
              <CardContent className="text-sm text-red-200">{parseError}</CardContent>
            </Card>
          ) : null}

          {activeParse ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Summary</div>
                <div className="mt-2 text-sm font-semibold">{orderedItems.length || activeParse.items.length} items</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {Object.entries(activeParse.summary.platformDistribution ?? {})
                    .map(([p, c]) => `${c} ${p}`)
                    .join(", ") || "—"}
                </div>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Estimated cost: <span className="font-semibold">${Number(estimatedCost ?? 0).toFixed(2)}</span>
                </div>

                {activeParse.errors.length ? (
                  <div className="mt-3 text-xs text-red-200">
                    {activeParse.errors.length} error(s). You must fix them or remove the invalid rows.
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-green-200">All rows valid (or only warnings).</div>
                )}
              </Card>

              <Card className="p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Preview</div>
                <div className="mt-2 max-h-[340px] overflow-auto">
                  <div className="space-y-3">
                    {orderedItems.length ? (
                      orderedItems.map((it: any, idx: number) => {
                        const platform = String(it.platform ?? "");
                        const formats: string[] = (PLATFORM_SPECS as any)[platform]?.supportedFormats ?? [];
                        const format = String(it.format ?? (formats[0] ?? "")) || (formats[0] ?? "");
                        return (
                          <div
                            key={`${it.topic}-${idx}`}
                            draggable
                            onDragStart={() => setDragFromIndex(idx)}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={() => {
                              if (dragFromIndex == null) return;
                              setOrderedItems((prev) => reorderArray(prev, dragFromIndex, idx));
                              setDragFromIndex(null);
                            }}
                            className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="rounded border border-[hsl(var(--border))] px-1 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                                    onClick={() => setOrderedItems((prev) => reorderArray(prev, idx, Math.max(0, idx - 1)))}
                                    disabled={idx === 0}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-[hsl(var(--border))] px-1 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                                    onClick={() =>
                                      setOrderedItems((prev) => reorderArray(prev, idx, Math.min(prev.length - 1, idx + 1)))
                                    }
                                    disabled={idx === orderedItems.length - 1}
                                  >
                                    ↓
                                  </button>
                                </div>
                                <div className="truncate">
                                  <span className="font-semibold">{idx + 1}.</span>
                                </div>
                              </div>
                              <div className="shrink-0 text-[hsl(var(--muted-foreground))]">
                                {platform || "—"} / {format || "—"}
                              </div>
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <Input
                                value={String(it.topic ?? "")}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setOrderedItems((prev) => prev.map((x: any, i: number) => (i === idx ? { ...x, topic: v } : x)));
                                }}
                                placeholder="Topic"
                              />
                              <Input
                                type="date"
                                value={String(it.date ?? "")}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setOrderedItems((prev) => prev.map((x: any, i: number) => (i === idx ? { ...x, date: v } : x)));
                                }}
                              />
                              <select
                                className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 text-sm"
                                value={platform}
                                onChange={(e) => {
                                  const nextPlatform = e.target.value;
                                  const nextFormats: string[] = (PLATFORM_SPECS as any)[nextPlatform]?.supportedFormats ?? [];
                                  setOrderedItems((prev) =>
                                    prev.map((x: any, i: number) =>
                                      i === idx ? { ...x, platform: nextPlatform, format: nextFormats[0] ?? x.format } : x
                                    )
                                  );
                                }}
                              >
                                {PLATFORM_OPTIONS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>

                              <select
                                className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 text-sm"
                                value={format}
                                onChange={(e) => {
                                  const nextFormat = e.target.value;
                                  setOrderedItems((prev) =>
                                    prev.map((x: any, i: number) => (i === idx ? { ...x, format: nextFormat } : x))
                                  );
                                }}
                              >
                                {formats.map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">Parse your calendar first.</div>
                    )}
                  </div>

                  {activeParse.errors.length ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold text-red-200">Errors</div>
                      {activeParse.errors.slice(0, 10).map((e, i) => (
                        <div key={i} className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
                          Row {e.row}: {e.message}
                        </div>
                      ))}
                      {activeParse.errors.length > 10 ? (
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">…and more</div>
                      ) : null}
                    </div>
                  ) : null}
                  {activeParse.warnings.length ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold text-yellow-200">Warnings</div>
                      {activeParse.warnings.slice(0, 10).map((w, i) => (
                        <div key={i} className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-200">
                          {w.row ? `Row ${w.row}: ` : ""}
                          {w.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>
          ) : null}

          <div className="flex justify-between gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!activeParse || activeParse.errors.length > 0 || (orderedItems.length || 0) === 0}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Job name</div>
                <Input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="March Instagram Calendar" />
                <div className="text-xs text-[hsl(var(--muted-foreground))]">This name shows up in the batch list and review page.</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Brand</div>
                <select
                  className="h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm"
                  value={brandId ?? ""}
                  onChange={(e) => setBrandId(e.target.value || null)}
                >
                  <option value="">No brand (fallback)</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-sm font-semibold">Processing strategy</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[
                { key: "sequential", title: "Standard (Sequential)", desc: "One design at a time (slowest)." },
                { key: "parallel", title: "Fast (Parallel, max 5)", desc: "Up to 5 concurrent generations." },
                { key: "anthropic_batch", title: "Economy (Anthropic Batch API)", desc: "50% cost reduction, results in ~24 hours." },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setProcessingStrategy(opt.key as any)}
                  className={`rounded-[var(--radius-card)] border p-4 text-left transition-colors ${
                    processingStrategy === opt.key
                      ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-muted))]/20"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-elevated))]"
                  }`}
                >
                  <div className="text-sm font-semibold">{opt.title}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{opt.desc}</div>
                  {opt.key === "anthropic_batch" ? (
                    <div className="mt-2 text-xs font-semibold text-[hsl(var(--accent))]">
                      Save ~${savingsVsStandard.toFixed(2)} vs Standard
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </Card>

          <div className="flex justify-between gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)} disabled={!activeParse || activeParse.errors.length > 0}>
              Review
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Review & Submit</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {activeParse?.items?.length ?? 0} designs • Estimated cost: ${estimatedCost.toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Strategy:{" "}
                  {processingStrategy === "sequential"
                    ? "Sequential"
                    : processingStrategy === "parallel"
                      ? "Parallel (max 5)"
                      : "Anthropic Batch API"}
                </div>
              </div>
              <div className="text-right text-xs text-[hsl(var(--muted-foreground))]">
                <div className="font-semibold">{jobName}</div>
                <div>{brandId ? "Brand selected" : "No brand"}</div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {processingStrategy === "anthropic_batch"
                ? "You'll be notified when your batch is ready — usually within 24 hours."
                : "Designs will appear in the review grid as they complete."}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={startGeneration} disabled={!activeParse?.items?.length}>
                Start Generation
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

