"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock, ChevronDown } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";
import {
  REVISION_SUGGESTIONS,
  DEFAULT_REVISION_SUGGESTIONS,
} from "@/constants/revisionSuggestions";
import type { Platform } from "@/types/design";
import { referenceRevisionSuggestions } from "@/lib/ai/referenceRevisionSuggestions";

// ─── helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function exactTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

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
      // skip malformed
    }
  }
  return events;
}

function normalizeSectionToken(s: string) {
  return s.toLowerCase().replace(/[_-]/g, " ").trim();
}

function detectSectionTarget(text: string, sectionPlan?: string[] | null) {
  const t = normalizeSectionToken(text);
  if (!sectionPlan || sectionPlan.length === 0) return null;
  for (const s of sectionPlan) {
    const sn = normalizeSectionToken(s);
    if (!sn) continue;
    if (t.includes(sn)) return s;
  }
  // Light heuristic for prompts like "hero section" etc.
  for (const s of sectionPlan) {
    const firstWord = normalizeSectionToken(s).split(" ")[0];
    if (!firstWord) continue;
    if (t.includes(firstWord)) return s;
  }
  return null;
}

// ─── component ──────────────────────────────────────────────────────────────

export function WorkspaceRightPanel() {
  const [tab, setTab] = useState<"revisions" | "details">("revisions");
  const [revisionInput, setRevisionInput] = useState("");
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const {
    revisionMessages,
    addRevisionMessage,
    updateRevisionMessage,
    generationState,
    versionHistory,
    activeVersionNumber,
    setActiveVersionNumber,
    setPreviewHtml,
    previewHtml,
    activeDesignId,
    setRevisionInProgress,
    revisionInProgress,
    triggerVersionFlash,
    activeSlide,
    referenceImageUrl,
    activeReferences,
    setVersionHistory,
    enqueueRevision,
    dequeueRevision,
    revisionQueue,
    activeRevisionQueueId,
    setActiveRevisionQueueId,
    lastGenerationMeta,
    setHoveredSectionType,
  } = useWorkspaceStore((s) => s);

  const { enqueueToast } = useUIStore((s) => s);

  const [designMeta, setDesignMeta] = useState<any>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");

  const chatRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const throttlePreviewRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  // ─── Load design metadata ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeDesignId) return;
    let mounted = true;
    (async () => {
      const res = await fetch(`/api/design/${activeDesignId}`);
      const json = await res.json();
      if (mounted && res.ok && json.success) {
        setDesignMeta(json.data);
        setTitleDraft(json.data.title ?? "");
        setTagsDraft((json.data.tags ?? []).join(", "));
      }
    })();
    return () => { mounted = false; };
  }, [activeDesignId, activeVersionNumber, versionHistory.length]);

  // ─── Scroll tracking ────────────────────────────────────────────────────
  const checkAtBottom = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    setShowJumpBtn(!isAtBottomRef.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // Auto-scroll when messages change IFF user is at bottom
  useEffect(() => {
    if (isAtBottomRef.current) scrollToBottom();
  }, [revisionMessages.length, scrollToBottom]);

  const isBusy =
    generationState === "connecting" ||
    generationState === "generating" ||
    generationState === "processing_images" ||
    revisionInProgress;

  // ─── Throttled preview updater ───────────────────────────────────────────
  const schedulePreviewUpdate = useCallback(
    (html: string) => {
      if (throttlePreviewRef.current) return;
      throttlePreviewRef.current = setTimeout(() => {
        setPreviewHtml(html);
        throttlePreviewRef.current = null;
      }, 200);
    },
    [setPreviewHtml]
  );

  // ─── Core SSE revision runner ────────────────────────────────────────────
  const runRevision = useCallback(
    async (item: {
      designId: string;
      revisionPrompt: string;
      slideIndex?: number;
      referenceImageUrl?: string | null;
      referenceIds?: string[];
      referenceRoles?: Record<string, "layout" | "style" | "color">;
      queueId?: string;
    }) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setRevisionInProgress(true);
      setActiveRevisionQueueId(item.queueId ?? null);

      let htmlBuffer = "";
      let assistantMsgId: string | null = null;

      // Add typing indicator message
      addRevisionMessage({ role: "assistant", content: "" }); // placeholder for typing
      // We track via revisionMessages length; cannot get id directly from add – use a placeholder approach
      // Instead use a temp "typing" message approach via a local state pattern
      // We'll clear this and add the real one on complete.

      try {
        const res = await fetch("/api/design/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            designId: item.designId,
            revisionPrompt: item.revisionPrompt,
            slideIndex: item.slideIndex,
            referenceImageUrl: item.referenceImageUrl ?? undefined,
            referenceIds: item.referenceIds ?? undefined,
            referenceRoles: item.referenceRoles ?? undefined,
          }),
        });

        if (!res.body) throw new Error("No stream body");

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
            if (evt.event === "chunk") {
              htmlBuffer += evt.data.html ?? "";
              schedulePreviewUpdate(htmlBuffer);
            } else if (evt.event === "complete") {
              if (throttlePreviewRef.current) {
                clearTimeout(throttlePreviewRef.current);
                throttlePreviewRef.current = null;
              }
              setPreviewHtml(htmlBuffer);
              triggerVersionFlash();
              // Refresh version history
              if (item.designId) {
                const r = await fetch(`/api/design/${item.designId}`);
                const j = await r.json();
                if (r.ok && j.success) {
                  setVersionHistory(j.data.versions ?? []);
                  setActiveVersionNumber(evt.data.versionNumber ?? null);
                  setDesignMeta(j.data);
                }
              }
              addRevisionMessage({
                role: "system",
                content: `Version ${evt.data.versionNumber} created • ${evt.data.model} • ${evt.data.generationTimeMs}ms`,
              });
            } else if (evt.event === "error") {
              addRevisionMessage({
                role: "error",
                content: evt.data?.message ?? "Revision failed.",
              });
            }
          }
        }
      } catch {
        addRevisionMessage({
          role: "error",
          content: "Revision failed due to network error.",
        });
      } finally {
        processingRef.current = false;
        setRevisionInProgress(false);
        setActiveRevisionQueueId(null);
        // Process next in queue
        const next = dequeueRevision();
        if (next) {
          void runRevision({
            designId: next.designId,
            revisionPrompt: next.revisionPrompt,
            slideIndex: next.slideIndex,
            referenceImageUrl: next.referenceImageUrl,
            referenceIds: next.referenceIds,
            referenceRoles: next.referenceRoles,
            queueId: next.id,
          });
        }
      }
    },
    [
      addRevisionMessage,
      dequeueRevision,
      schedulePreviewUpdate,
      setActiveRevisionQueueId,
      setActiveVersionNumber,
      setPreviewHtml,
      setRevisionInProgress,
      setVersionHistory,
      triggerVersionFlash,
    ]
  );

  // ─── Submit revision ─────────────────────────────────────────────────────
  const submitRevision = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !activeDesignId) return;

      addRevisionMessage({ role: "user", content: trimmed });
      setRevisionInput("");

      if (revisionInProgress || processingRef.current) {
        // Try to enqueue
        const accepted = enqueueRevision({
          designId: activeDesignId,
          revisionPrompt: trimmed,
          slideIndex: activeSlide,
          referenceImageUrl: referenceImageUrl ?? null,
          referenceIds: activeReferences.filter((r) => r.applying).map((r) => r.referenceId),
          referenceRoles: Object.fromEntries(activeReferences.map((r) => [r.referenceId, r.role])),
        });
        if (!accepted) {
          enqueueToast({
            title: "Queue full",
            description: "Please wait for your current revisions to complete.",
            type: "error",
          });
          return;
        }
        addRevisionMessage({
          role: "system",
          content: "⏳ Queued – will run after the current revision completes.",
          isQueued: true,
        });
        return;
      }

      void runRevision({
        designId: activeDesignId,
        revisionPrompt: trimmed,
        slideIndex: activeSlide,
        referenceImageUrl: referenceImageUrl ?? null,
        referenceIds: activeReferences.filter((r) => r.applying).map((r) => r.referenceId),
        referenceRoles: Object.fromEntries(activeReferences.map((r) => [r.referenceId, r.role])),
      });
    },
    [
      activeDesignId,
      activeSlide,
      addRevisionMessage,
      enqueueRevision,
      enqueueToast,
      referenceImageUrl,
      activeReferences,
      revisionInProgress,
      runRevision,
    ]
  );

  // ─── Suggestions ─────────────────────────────────────────────────────────
  const platform = (lastGenerationMeta?.platform ?? "") as Platform;
  const sectionPlan = (lastGenerationMeta as any)?.sectionPlan as string[] | null;
  const suggestions = useMemo(() => {
    const firstReferenceAnalysis = activeReferences.find((r) => r.applying && r.analysis)?.analysis;
    if (firstReferenceAnalysis) {
      const brandPrimary = (designMeta?.brand?.colors as any)?.primary as string | undefined;
      const generatedDensity =
        (lastGenerationMeta as any)?.sectionCount && (lastGenerationMeta as any).sectionCount >= 7
          ? "dense"
          : "moderate";
      return referenceRevisionSuggestions(firstReferenceAnalysis, null, {
        brandPrimaryColor: brandPrimary,
        generatedDensity,
        hasGradientInCurrent: false,
        currentHtml: previewHtml,
      }).slice(0, 3);
    }
    const list = REVISION_SUGGESTIONS[platform] ?? DEFAULT_REVISION_SUGGESTIONS;
    return list.slice(0, 3);
  }, [platform, activeReferences, designMeta?.brand?.colors, lastGenerationMeta, previewHtml]);

  // ─── Version list ────────────────────────────────────────────────────────
  const sortedVersions = useMemo(
    () => [...versionHistory].sort((a, b) => b.versionNumber - a.versionNumber),
    [versionHistory]
  );

  return (
    <Tooltip.Provider delayDuration={600}>
      <div className="flex h-full flex-col bg-[hsl(var(--surface))]">
        {/* Tab bar */}
        <div className="border-b border-[hsl(var(--border))] p-2">
          <div className="flex gap-2">
            <Button size="sm" variant={tab === "revisions" ? "default" : "secondary"} onClick={() => setTab("revisions")}>
              Revisions
            </Button>
            <Button size="sm" variant={tab === "details" ? "default" : "secondary"} onClick={() => setTab("details")}>
              Details
            </Button>
          </div>
        </div>

        {tab === "revisions" ? (
          <>
            {/* Version history */}
            <div className="border-b border-[hsl(var(--border))] p-3">
              <div className="text-xs font-semibold text-[hsl(var(--foreground))]">Version History</div>
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                {sortedVersions.length === 0 ? (
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">No versions yet.</div>
                ) : (
                  sortedVersions.map((v) => (
                    <div
                      key={v.id}
                      className={`group flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                        activeVersionNumber === v.versionNumber
                          ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
                          : "hover:bg-[hsl(var(--surface-elevated))]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveVersionNumber(v.versionNumber);
                          setPreviewHtml(v.htmlContent);
                          triggerVersionFlash();
                        }}
                        className="flex flex-1 items-center justify-between text-left"
                      >
                        <span>v{v.versionNumber}</span>
                        <span className="text-[hsl(var(--muted-foreground))]">
                          {v.versionNumber > 1 ? "Revision" : "Initial"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="hidden rounded border border-[hsl(var(--border))] px-1 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] group-hover:inline-flex"
                        onClick={async () => {
                          if (!activeDesignId) return;
                          const res = await fetch(`/api/design/${activeDesignId}/restore`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ versionNumber: v.versionNumber }),
                          });
                          const json = await res.json();
                          if (res.ok && json.success) {
                            setActiveVersionNumber(json.data.versionNumber);
                            setPreviewHtml(v.htmlContent);
                            triggerVersionFlash();
                          }
                        }}
                      >
                        Restore
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat messages */}
            <div
              ref={chatRef}
              onScroll={checkAtBottom}
              className="relative flex-1 space-y-2 overflow-y-auto p-3"
            >
              {revisionMessages.length === 0 ? (
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Ask for changes like "Increase heading size" or "Use darker background".
                </div>
              ) : (
                revisionMessages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onRetry={submitRevision}
                    targetSection={detectSectionTarget(m.content, sectionPlan)}
                    onHoverSection={setHoveredSectionType}
                  />
                ))
              )}

              {/* Typing indicator */}
              {revisionInProgress && (
                <div className="max-w-[80%] rounded bg-[hsl(var(--surface-elevated))] px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[hsl(var(--muted-foreground))]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[hsl(var(--muted-foreground))] [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[hsl(var(--muted-foreground))] [animation-delay:240ms]" />
                  </span>
                </div>
              )}

              {/* Queue count badge */}
              {revisionQueue.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                  <Clock className="h-3 w-3" />
                  {revisionQueue.length} revision{revisionQueue.length > 1 ? "s" : ""} queued
                </div>
              )}

              {/* Jump to latest */}
              {showJumpBtn && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="sticky bottom-2 mx-auto flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]/90 px-3 py-1 text-[10px] shadow backdrop-blur"
                >
                  <ChevronDown className="h-3 w-3" />
                  Jump to latest
                </button>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-[hsl(var(--border))] p-3">
              {/* Suggestion chips */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRevisionInput(s)}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent-muted))] hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <textarea
                id="revision-textarea"
                value={revisionInput}
                onChange={(e) => setRevisionInput(e.target.value.slice(0, 1000))}
                placeholder="Request a change..."
                rows={3}
                disabled={isBusy && revisionQueue.length >= 3}
                title={isBusy && revisionQueue.length >= 3 ? "Queue full. Wait for revisions to complete." : ""}
                className="w-full resize-none rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitRevision(revisionInput);
                  }
                }}
              />
              <div className="mt-2 flex justify-between items-center">
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {revisionInput.length}/1000
                </span>
                <Button
                  size="sm"
                  onClick={() => submitRevision(revisionInput)}
                  disabled={!revisionInput.trim() || (isBusy && revisionQueue.length >= 3)}
                >
                  Send
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3 p-3 text-xs">
            <div className="space-y-1">
              <label className="text-[hsl(var(--muted-foreground))]">Title</label>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={async () => {
                  if (!activeDesignId) return;
                  await fetch(`/api/design/${activeDesignId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: titleDraft }),
                  });
                }}
                className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1"
                placeholder="Design title"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[hsl(var(--muted-foreground))]">Tags</label>
              <input
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                onBlur={async () => {
                  if (!activeDesignId) return;
                  const tags = tagsDraft.split(",").map((t) => t.trim()).filter(Boolean);
                  await fetch(`/api/design/${activeDesignId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tags }),
                  });
                }}
                className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1"
                placeholder="tag1, tag2"
              />
            </div>
            <div className="text-[hsl(var(--muted-foreground))]">
              Status: {designMeta?.status ?? generationState}
            </div>
            <div className="text-[hsl(var(--muted-foreground))]">
              Created:{" "}
              {designMeta?.createdAt ? new Date(designMeta.createdAt).toLocaleString() : "—"}
            </div>
            <div className="mt-2 space-y-1">
              <div className="font-semibold text-[hsl(var(--muted-foreground))]">Project</div>
              <ProjectSelector activeDesignId={activeDesignId} designMeta={designMeta} />
            </div>
            <TokenUsageSummary designMeta={designMeta} activeVersionNumber={activeVersionNumber} />

          {activeDesignId ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => window.open(`/designs/${activeDesignId}/exports`, "_blank")}
                className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-left text-xs hover:bg-[hsl(var(--surface))]"
              >
                Export history
              </button>
            </div>
          ) : null}
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onRetry,
  targetSection,
  onHoverSection,
}: {
  message: {
    id: string;
    role: "user" | "assistant" | "system" | "error";
    content: string;
    createdAt: string;
    isQueued?: boolean;
  };
  onRetry: (text: string) => void;
  targetSection?: string | null;
  onHoverSection: (t: string | null) => void;
}) {
  const hoverHandlers = targetSection
    ? {
        onMouseEnter: () => onHoverSection(targetSection),
        onMouseLeave: () => onHoverSection(null),
      }
    : {};

  if (message.role === "system") {
    return (
      <div
        {...hoverHandlers}
        className="text-center text-[10px] italic text-[hsl(var(--muted-foreground))]"
      >
        {message.content}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div
        {...hoverHandlers}
        className="flex max-w-[90%] flex-col gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
      >
        <div className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {message.content}
        </div>
        <button
          type="button"
          onClick={() => onRetry(message.content)}
          className="self-start rounded border border-red-400/40 px-2 py-0.5 text-[10px] hover:bg-red-400/10"
        >
          Retry
        </button>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      {...hoverHandlers}
      className={`flex max-w-[90%] flex-col gap-1 ${isUser ? "ml-auto items-end" : "items-start"}`}
    >
      {message.content && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            isUser
              ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
              : "bg-[hsl(var(--surface-elevated))] text-[hsl(var(--foreground))]"
          }`}
        >
          {message.content}
        </div>
      )}
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="cursor-default text-[10px] text-[hsl(var(--muted-foreground))]">
            {relativeTime(message.createdAt)}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1 text-[10px] text-[hsl(var(--foreground))] shadow"
            sideOffset={4}
          >
            {exactTime(message.createdAt)}
            <Tooltip.Arrow className="fill-[hsl(var(--surface-elevated))]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

// ─── ProjectSelector ─────────────────────────────────────────────────────────

function ProjectSelector({
  activeDesignId,
  designMeta,
}: {
  activeDesignId: string | null;
  designMeta: any;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [value, setValue] = useState<string | "">("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/projects");
      const json = await res.json();
      if (res.ok && json.success) setProjects(json.data ?? []);
    })();
  }, []);

  useEffect(() => {
    setValue(designMeta?.projectId ?? "");
  }, [designMeta?.projectId]);

  if (!projects.length) return null;

  return (
    <select
      className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1"
      value={value}
      onChange={async (e) => {
        const next = e.target.value || null;
        setValue(e.target.value);
        if (!activeDesignId) return;
        await fetch(`/api/design/${activeDesignId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: next }),
        });
      }}
    >
      <option value="">Unassigned</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// ─── TokenUsageSummary ────────────────────────────────────────────────────────

function TokenUsageSummary({
  designMeta,
  activeVersionNumber,
}: {
  designMeta: any;
  activeVersionNumber: number | null;
}) {
  const version =
    designMeta?.versions?.find((v: any) => v.versionNumber === activeVersionNumber) ??
    designMeta?.versions?.[designMeta?.versions?.length - 1];
  if (!version) return null;
  const input = version.promptTokens ?? 0;
  const output = version.completionTokens ?? 0;
  const cached = version.cachedTokens ?? 0;

  return (
    <div className="mt-3 space-y-1 text-[hsl(var(--muted-foreground))]">
      <div className="font-semibold">Token usage</div>
      <div className="flex justify-between">
        <span className="text-xs">Input</span>
        <span className="text-xs">{input}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-xs">Output</span>
        <span className="text-xs">{output}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-xs">Cached</span>
        <span className="text-xs">{cached}</span>
      </div>
    </div>
  );
}
