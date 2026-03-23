"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ExternalLink, FileCode2, FileImage, FileJson, FileText, FileUp, Loader2, Plus, RotateCw, Share2, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";

type ExportTab = "image" | "figma" | "code" | "pdf";
type ExportHistoryItem = {
  id: string;
  format: string;
  versionNumber: number;
  fileUrl: string;
  figmaUrl: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
};

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

async function pollUntilComplete(jobId: string, onUpdate: (status: any) => void) {
  while (true) {
    const res = await fetch(`/api/export/status/${jobId}`);
    const json = await res.json();
    if (json?.success) {
      onUpdate(json.data);
      if (json.data.status === "complete" || json.data.status === "failed") return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export function ExportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { enqueueToast } = useUIStore((s) => s);

  const {
    activeDesignId,
    activeVersionNumber,
    lastGenerationMeta,
    referenceImageUrl,
  } = useWorkspaceStore((s) => s);

  const [tab, setTab] = useState<ExportTab>("image");

  const isWebOrDash = lastGenerationMeta?.platform === "website" || lastGenerationMeta?.platform === "dashboard";
  const [exportSectionsIndividually, setExportSectionsIndividually] = useState(false);

  const [imgFormat, setImgFormat] = useState<"png" | "jpg">("png");
  const [jpgQuality, setJpgQuality] = useState(90);
  const [pdfPageFormat, setPdfPageFormat] = useState<"A4" | "A3" | "Letter">("A4");
  const [pdfLandscape, setPdfLandscape] = useState(false);

  const [isWorking, setIsWorking] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "pending" | "processing" | "complete" | "failed">("idle");

  const [result, setResult] = useState<any>(null);

  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const loadedRef = useRef(false);

  /** UserPreference `figma_plugin_installed` — drives Figma tab UX. */
  const [figmaPluginInstalled, setFigmaPluginInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || !activeDesignId) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/exports/${activeDesignId}`);
        const json = await res.json();
        if (res.ok && json.success) {
          const exports = json.data?.exports ?? [];
          setHistory(
            activeVersionNumber ? exports.filter((e: any) => e.versionNumber === activeVersionNumber) : exports
          );
        }
      } catch {
        // ignore
      }
    })();
  }, [open, activeDesignId]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/preferences?key=figma_plugin_installed");
        const json = await res.json();
        if (res.ok && json.success) {
          const v = json.data?.preferenceValue;
          setFigmaPluginInstalled(v === true);
        } else {
          setFigmaPluginInstalled(false);
        }
      } catch {
        setFigmaPluginInstalled(false);
      }
    })();
  }, [open]);

  const saveFigmaPluginPreference = async (installed: boolean) => {
    try {
      await fetch("/api/preferences/figma_plugin_installed", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferenceValue: installed }),
      });
      setFigmaPluginInstalled(installed);
    } catch {
      enqueueToast({ title: "Could not save preference", type: "error" });
    }
  };

  useEffect(() => {
    if (!open) {
      loadedRef.current = false;
      setResult(null);
      setJobId(null);
      setJobStatus("idle");
      setIsWorking(false);
      setExportSectionsIndividually(false);
      setTab(isWebOrDash ? "pdf" : "image");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTab(isWebOrDash ? "pdf" : "image");
  }, [open, isWebOrDash]);

  const dimensionsLabel = useMemo(() => {
    const dims = lastGenerationMeta?.dimensions;
    if (!dims || typeof dims !== "object") return "—";
    return `${dims.width} × ${dims.height}`;
  }, [lastGenerationMeta?.dimensions]);

  const startImageExport = async () => {
    if (!activeDesignId) return;
    setIsWorking(true);
    setResult(null);
    setJobId(null);
    setJobStatus("idle");

    try {
      const res = await fetch(`/api/export/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: activeDesignId,
          versionNumber: activeVersionNumber ?? undefined,
          format: imgFormat,
          quality: imgFormat === "jpg" ? jpgQuality : undefined,
          exportSectionsIndividually,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        enqueueToast({ title: "Export failed", description: json?.error?.message ?? "Unknown error", type: "error" });
        return;
      }

      const data = json.data;
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus("pending");
        await pollUntilComplete(data.jobId, (update) => {
          setJobStatus(update.status);
            if (update.resultUrl && typeof update.resultUrl === "string") {
              try {
                const parsed = JSON.parse(update.resultUrl);
                setResult({ ...parsed, errorMessage: update.errorMessage });
              } catch {
                setResult({ resultUrl: update.resultUrl, errorMessage: update.errorMessage });
              }
            } else {
              setResult({ errorMessage: update.errorMessage });
            }
        });
      } else {
        setJobStatus("complete");
        setResult(data);
      }
    } finally {
      setIsWorking(false);
    }
  };

  const startPdfExport = async () => {
    if (!activeDesignId) return;
    setIsWorking(true);
    setResult(null);
    setJobId(null);
    setJobStatus("idle");

    try {
      const res = await fetch(`/api/export/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: activeDesignId,
          versionNumber: activeVersionNumber ?? undefined,
          pageFormat: pdfPageFormat,
          landscape: pdfLandscape,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        enqueueToast({ title: "Export failed", description: json?.error?.message ?? "Unknown error", type: "error" });
        return;
      }
      const data = json.data;
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus("pending");
        await pollUntilComplete(data.jobId, (update) => {
          setJobStatus(update.status);
          setResult({ downloadUrl: update.resultUrl, errorMessage: update.errorMessage });
        });
      } else {
        setJobStatus("complete");
        setResult(data);
      }
    } finally {
      setIsWorking(false);
    }
  };

  const startCodeExport = async () => {
    if (!activeDesignId) return;
    setIsWorking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/export/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: activeDesignId, versionNumber: activeVersionNumber ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        enqueueToast({ title: "Export failed", description: json?.error?.message ?? "Unknown error", type: "error" });
        return;
      }
      setResult(json.data);
      setJobStatus("complete");
    } finally {
      setIsWorking(false);
    }
  };

  const startFigmaExport = async () => {
    if (!activeDesignId) return;
    setIsWorking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/export/figma-bridge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: activeDesignId, versionNumber: activeVersionNumber ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        enqueueToast({ title: "Export failed", description: json?.error?.message ?? "Unknown error", type: "error" });
        return;
      }
      setResult(json.data);
      setJobStatus("complete");
    } finally {
      setIsWorking(false);
    }
  };

  const startFigmaPluginPush = async () => {
    if (!activeDesignId) return;
    setIsWorking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/export/figma-plugin-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: activeDesignId, versionNumber: activeVersionNumber ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        enqueueToast({ title: "Could not queue push", description: json?.error?.message ?? "Unknown error", type: "error" });
        return;
      }
      setResult({ ...json.data, pluginPush: true });
      setJobStatus("complete");
      enqueueToast({
        title: "Ready in Figma",
        description: "Open the DesignForge plugin — your design will appear ready to push.",
        type: "success",
      });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base">Export Design</DialogTitle>
            <DialogDescription>Ready to download or share.</DialogDescription>
          </div>
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant={tab === "image" ? "default" : "secondary"} onClick={() => setTab("image")}>
            Image
          </Button>
          <Button size="sm" variant={tab === "figma" ? "default" : "secondary"} onClick={() => setTab("figma")}>
            Figma
          </Button>
          <Button size="sm" variant={tab === "code" ? "default" : "secondary"} onClick={() => setTab("code")}>
            Code
          </Button>
          <Button size="sm" variant={tab === "pdf" ? "default" : "secondary"} onClick={() => setTab("pdf")}>
            PDF
          </Button>
        </div>

        <div className="mt-4 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3">
          {tab === "image" ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={imgFormat === "png" ? "default" : "secondary"} onClick={() => setImgFormat("png")}>
                  PNG
                </Button>
                <Button size="sm" variant={imgFormat === "jpg" ? "default" : "secondary"} onClick={() => setImgFormat("jpg")}>
                  JPG
                </Button>
              </div>

              {isWebOrDash ? (
                <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <input
                    type="checkbox"
                    checked={exportSectionsIndividually}
                    onChange={(e) => setExportSectionsIndividually(e.target.checked)}
                  />
                  Export sections individually
                </label>
              ) : null}
              {imgFormat === "jpg" ? (
                <div className="space-y-1 text-xs">
                  <label className="flex items-center justify-between">
                    <span>Quality: {jpgQuality}%</span>
                    <span className="text-[hsl(var(--muted-foreground))]">80–100</span>
                  </label>
                  <input
                    type="range"
                    min={80}
                    max={100}
                    value={jpgQuality}
                    onChange={(e) => setJpgQuality(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              ) : null}
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Dimensions: <span className="text-[hsl(var(--foreground))]">{dimensionsLabel}</span>
              </div>

              <Button
                className="w-full"
                onClick={() => void startImageExport()}
                disabled={isWorking || !activeDesignId}
              >
                {isWorking ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Rendering export…
                  </span>
                ) : (
                  <>Export Image</>
                )}
              </Button>
            </div>
          ) : null}

          {tab === "pdf" ? (
            <div className="space-y-3">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                PDF exports are optimized for printing.
              </div>
              <div className="flex gap-2">
                {(["A4", "A3", "Letter"] as const).map((fmt) => (
                  <Button
                    key={fmt}
                    type="button"
                    size="sm"
                    variant={pdfPageFormat === fmt ? "default" : "secondary"}
                    onClick={() => setPdfPageFormat(fmt)}
                  >
                    {fmt}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!pdfLandscape ? "default" : "secondary"}
                  onClick={() => setPdfLandscape(false)}
                >
                  Portrait
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pdfLandscape ? "default" : "secondary"}
                  onClick={() => setPdfLandscape(true)}
                >
                  Landscape
                </Button>
              </div>
              <Button className="w-full" onClick={() => void startPdfExport()} disabled={isWorking || !activeDesignId}>
                {isWorking ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Rendering PDF…
                  </span>
                ) : (
                  <>Export PDF</>
                )}
              </Button>
            </div>
          ) : null}

          {tab === "code" ? (
            <div className="space-y-3">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Download HTML/CSS and assets as a ZIP.
              </div>
              <Button className="w-full" onClick={() => void startCodeExport()} disabled={isWorking || !activeDesignId}>
                {isWorking ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Packaging…
                  </span>
                ) : (
                  <>Download Code</>
                )}
              </Button>
            </div>
          ) : null}

          {tab === "figma" ? (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[hsl(var(--foreground))]">Have the DesignForge Figma plugin?</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={figmaPluginInstalled === true ? "default" : "secondary"}
                  onClick={() => void saveFigmaPluginPreference(true)}
                  disabled={figmaPluginInstalled === null}
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={figmaPluginInstalled === false ? "default" : "secondary"}
                  onClick={() => void saveFigmaPluginPreference(false)}
                  disabled={figmaPluginInstalled === null}
                >
                  No
                </Button>
              </div>

              {figmaPluginInstalled === true ? (
                <div className="space-y-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Queues this design for the plugin. Open the DesignForge plugin in Figma — it will show a{" "}
                    <strong className="text-[hsl(var(--foreground))]">ready to push</strong> banner (polls every ~30s).
                  </p>
                  <Button className="w-full" onClick={() => void startFigmaPluginPush()} disabled={isWorking || !activeDesignId}>
                    {isWorking ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
                      </span>
                    ) : (
                      <>Push to Figma</>
                    )}
                  </Button>
                </div>
              ) : figmaPluginInstalled === false ? (
                <div className="space-y-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    Creates a temporary link that the <strong>html.to.design</strong> plugin can import (same as before).
                  </div>
                  <Button className="w-full" onClick={() => void startFigmaExport()} disabled={isWorking || !activeDesignId}>
                    {isWorking ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Generating link…
                      </span>
                    ) : (
                      <>Generate Figma Link</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Loading preference…</div>
              )}
            </div>
          ) : null}

          {jobStatus === "pending" || jobStatus === "processing" ? (
            <div className="mt-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--accent))]" />
                <div>Generating your export…</div>
              </div>
              {jobId ? <div className="mt-1 text-[hsl(var(--muted-foreground))]">Job: {jobId}</div> : null}
            </div>
          ) : null}

          {jobStatus === "complete" && result ? (
            <div className="mt-4 space-y-2">
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3 text-xs">
                <div className="font-semibold text-[hsl(var(--foreground))]">Your export is ready!</div>
                {tab === "image" ? (
                  <>
                    {result.fileUrls?.length ? (
                      <div className="mt-2">
                        <div className="text-[hsl(var(--muted-foreground))]">Downloads</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {result.fileUrls.map((u: string, idx: number) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 hover:bg-[hsl(var(--surface-elevated))]">
                              <Download className="h-3.5 w-3.5" />
                              <span>{idx === 0 ? "Design" : `Slide ${idx + 1}`}</span>
                            </a>
                          ))}
                          {result.zipUrl ? (
                            <a href={result.zipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 hover:bg-[hsl(var(--surface-elevated))]">
                              <FileUp className="h-3.5 w-3.5" />
                              <span>ZIP</span>
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : result.zipUrl || result.resultUrl ? (
                      <div className="mt-2">
                        <a
                          href={result.zipUrl ?? result.resultUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded bg-[hsl(var(--accent))] px-3 py-2 text-xs font-semibold text-white"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {tab === "pdf" ? (
                  <div className="mt-2">
                    {result.downloadUrl || result.resultUrl ? (
                      <a
                        href={result.downloadUrl ?? result.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded bg-[hsl(var(--accent))] px-3 py-2 text-xs font-semibold text-white"
                      >
                        <Download className="h-3.5 w-3.5" /> Download PDF
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {tab === "code" ? (
                  <div className="mt-2">
                    {result.downloadUrl ? (
                      <a
                        href={result.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded bg-[hsl(var(--accent))] px-3 py-2 text-xs font-semibold text-white"
                      >
                        <Download className="h-3.5 w-3.5" /> Download ZIP
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {tab === "figma" ? (
                  <div className="mt-2 space-y-2">
                    {result.pluginPush && result.shareUrl ? (
                      <>
                        <div className="text-[hsl(var(--muted-foreground))]">Preview link (also sent to the plugin)</div>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={result.shareUrl}
                            className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await navigator.clipboard.writeText(result.shareUrl);
                              enqueueToast({ title: "Link copied", type: "success" });
                            }}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy
                          </Button>
                        </div>
                        <div className="text-[hsl(var(--muted-foreground))] text-xs">Expires in 24 hours</div>
                      </>
                    ) : result.shareUrl ? (
                      <>
                        <div className="text-[hsl(var(--muted-foreground))]">Share URL</div>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={result.shareUrl}
                            className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await navigator.clipboard.writeText(result.shareUrl);
                              enqueueToast({ title: "Link copied", type: "success" });
                            }}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy
                          </Button>
                        </div>
                        <div className="text-[hsl(var(--muted-foreground))] text-xs">Expires in 24 hours</div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {jobStatus === "failed" ? (
            <div className="mt-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3 text-xs">
              <div className="font-semibold text-[hsl(var(--foreground))]">Export failed</div>
              <div className="mt-1 text-[hsl(var(--muted-foreground))]">{result?.errorMessage ?? "Unknown error"}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Previous exports</div>
          <div className="mt-2 max-h-44 overflow-y-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
            {history.length ? (
              <div className="divide-y divide-[hsl(var(--border))]">
                {history.slice(0, 8).map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{h.format}</div>
                      <div className="text-[hsl(var(--muted-foreground))]">
                        v{h.versionNumber} • {new Date(h.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <a
                      href={h.figmaUrl ?? h.fileUrl}
                      className="inline-flex items-center gap-2 rounded bg-[hsl(var(--surface-elevated))] px-2 py-1 hover:bg-[hsl(var(--surface))]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-[hsl(var(--muted-foreground))] text-xs">No previous exports yet.</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

