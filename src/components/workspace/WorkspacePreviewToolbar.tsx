"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, RefreshCw, Share2, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";
import { useDesignGeneration } from "@/hooks/useDesignGeneration";
import { ExportModal } from "@/components/workspace/ExportModal";

export function WorkspacePreviewToolbar({
  idSuffix = "",
}: {
  /** Suffix for button ids when a second preview toolbar exists (mobile vs desktop). */
  idSuffix?: "" | "-mobile";
}) {
  const {
    activeDesignId,
    lastGenerationMeta,
    lastPrompt,
    activeBrandProfileId,
    referenceImageUrl,
  } = useWorkspaceStore((s) => s);

  const { enqueueToast } = useUIStore((s) => s);
  const { startGeneration } = useDesignGeneration();

  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const regenWrapRef = useRef<HTMLDivElement | null>(null);

  const platform = lastGenerationMeta?.platform ?? "";
  const format = lastGenerationMeta?.format ?? "";

  const handleApprove = async () => {
    if (!activeDesignId || approving) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/design/${activeDesignId}/approve`, { method: "POST" });
      if (res.ok) {
        setApproved(true);
        enqueueToast({ title: "Design approved!", type: "success" });
      } else {
        const j = await res.json().catch(() => ({}));
        enqueueToast({ title: "Approve failed", description: j.error?.message, type: "error" });
      }
    } finally {
      setApproving(false);
    }
  };

  const handleShare = async () => {
    if (!activeDesignId || sharing) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/design/${activeDesignId}/share`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        await navigator.clipboard.writeText(json.data.shareUrl);
        enqueueToast({ title: "Share link copied!", description: json.data.shareUrl, type: "success" });
      } else {
        enqueueToast({ title: "Share failed", type: "error" });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleRegen = async () => {
    setShowRegenConfirm(false);
    if (!lastPrompt || !activeBrandProfileId) return;
    void startGeneration({
      prompt: lastPrompt,
      brandId: activeBrandProfileId,
      referenceImageUrl: referenceImageUrl ?? undefined,
    });
  };

  const handleTitleBlur = async () => {
    setEditingTitle(false);
    if (!activeDesignId || !title.trim()) return;
    await fetch(`/api/design/${activeDesignId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    document.title = `${title.trim()} – DesignForge AI`;
  };

  // Close the small regenerate confirmation popover on outside click / Escape.
  useEffect(() => {
    if (!showRegenConfirm) return;

    function onPointerDown(e: PointerEvent) {
      const wrap = regenWrapRef.current;
      if (!wrap) return;
      const target = e.target;
      if (target instanceof Node && !wrap.contains(target)) {
        setShowRegenConfirm(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowRegenConfirm(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showRegenConfirm]);

  return (
    <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-1.5">
      {/* Left: title + badges */}
      <div className="flex items-center gap-2 min-w-0">
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === "Enter") handleTitleBlur(); }}
            className="max-w-[200px] rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="max-w-[200px] truncate text-sm font-medium hover:text-[hsl(var(--accent))]"
            title="Click to edit title"
          >
            {title || "Untitled Design"}
          </button>
        )}

        {platform && (
          <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            {platform}
          </span>
        )}
        {format && (
          <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            {format}
          </span>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Approve */}
        <Button
          id={`approve-btn${idSuffix}`}
          size="sm"
          variant={approved ? "default" : "secondary"}
          onClick={handleApprove}
          disabled={approving || approved}
          className="gap-1"
        >
          {approved ? <Check className="h-3 w-3" /> : <ThumbsUp className="h-3 w-3" />}
          {approved ? "Approved" : "Approve"}
        </Button>

        {/* Regenerate */}
        <div className="relative" ref={regenWrapRef}>
          <Button
            id={`regenerate-btn${idSuffix}`}
            size="sm"
            variant="secondary"
            onClick={() => setShowRegenConfirm((v) => !v)}
            className="gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </Button>
          {showRegenConfirm && (
            <div className="absolute right-0 top-8 z-50 w-48 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3 shadow-lg text-xs">
              <p className="mb-2 text-[hsl(var(--foreground))]">Regenerate from scratch?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded bg-[hsl(var(--accent))] py-1 text-white hover:opacity-90"
                  onClick={handleRegen}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="flex-1 rounded border border-[hsl(var(--border))] py-1 hover:bg-[hsl(var(--surface))]"
                  onClick={() => setShowRegenConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Share */}
        <Button size="sm" variant="secondary" onClick={handleShare} disabled={sharing} className="gap-1">
          <Share2 className="h-3 w-3" />
          {sharing ? "Sharing..." : "Share"}
        </Button>

        {/* Export */}
        <Button size="sm" variant="secondary" onClick={() => setShowExportModal(true)} className="gap-1">
          <ExternalLink className="h-3 w-3" />
          Export
        </Button>
      </div>

      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />
    </div>
  );
}
