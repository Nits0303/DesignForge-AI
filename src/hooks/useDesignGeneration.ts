"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

type StartGenerationParams = {
  prompt: string;
  brandId: string;
  projectId?: string;
  referenceImageUrl?: string;
  referenceIds?: string[];
  referenceRoles?: Record<string, "layout" | "style" | "color">;
  strategy?: "fast" | "quality";
  sectionPlanOverride?: string[];
};

type SsePayload = {
  event: string;
  data: any;
};

function parseSseChunk(chunk: string): SsePayload[] {
  const events: SsePayload[] = [];
  const rawEvents = chunk.split("\n\n").filter(Boolean);
  for (const raw of rawEvents) {
    const lines = raw.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!eventLine || !dataLine) continue;
    const event = eventLine.replace("event:", "").trim();
    const json = dataLine.replace("data:", "").trim();
    try {
      events.push({ event, data: JSON.parse(json) });
    } catch {
      // ignore malformed event payload lines
    }
  }
  return events;
}

export function useDesignGeneration() {
  const abortRef = useRef<AbortController | null>(null);
  const throttleTimerRef = useRef<number | null>(null);

  const {
    setGenerationState,
    resetGeneration,
    appendStreamChunk,
    setPreviewHtml,
    setGenerationError,
    setStatusMessage,
    setActiveDesignId,
    setActiveVersionNumber,
    setLastGenerationMeta,
    setLastPrompt,
    streamedHtml,
  } = useWorkspaceStore((s) => s);

  const flushPreview = useCallback(() => {
    setPreviewHtml(useWorkspaceStore.getState().streamedHtml);
    throttleTimerRef.current = null;
  }, [setPreviewHtml]);

  const schedulePreviewFlush = useCallback(() => {
    if (throttleTimerRef.current != null) return;
    throttleTimerRef.current = window.setTimeout(flushPreview, 200);
  }, [flushPreview]);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const startGeneration = useCallback(
    async ({
      prompt,
      brandId,
      projectId,
      referenceImageUrl,
      referenceIds,
      referenceRoles,
      strategy,
      sectionPlanOverride,
    }: StartGenerationParams) => {
      stopGeneration();
      resetGeneration();
      setLastPrompt(prompt);
      setGenerationState("connecting");
      setGenerationError(null);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/design/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            brandId,
            projectId,
            referenceImageUrl,
            referenceIds,
            referenceRoles,
            strategy,
            sectionPlanOverride,
          }),
          signal: ac.signal,
        });

        if (!res.body) {
          throw new Error("No stream body available");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        setGenerationState("generating");

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = parseSseChunk(buffer);
          // Keep trailing partial event in buffer.
          const lastBoundary = buffer.lastIndexOf("\n\n");
          if (lastBoundary >= 0) {
            buffer = buffer.slice(lastBoundary + 2);
          }

          for (const evt of events) {
            if (evt.event === "status") {
              setActiveDesignId(evt.data.designId ?? null);
              if (evt.data.message) {
                setStatusMessage(String(evt.data.message));
              }
              setLastGenerationMeta({
                model: evt.data.model,
                estimatedTokens: evt.data.estimatedTokens,
                platform: evt.data.platform,
                format: evt.data.format,
                dimensions: evt.data.dimensions ?? null,
                sectionPlan: evt.data.sectionPlan ?? null,
                sectionCount: evt.data.sectionCount ?? null,
              });
            } else if (evt.event === "chunk") {
              appendStreamChunk(evt.data.html ?? "");
              schedulePreviewFlush();
            } else if (evt.event === "image_start") {
              setStatusMessage("Sourcing images...");
              setGenerationState("processing_images");
            } else if (evt.event === "image_complete") {
              setStatusMessage("Finalising...");
              setPreviewHtml(evt.data.updatedHtml ?? "");
            } else if (evt.event === "section_start") {
              const sectionType = evt.data.sectionType ?? "";
              const idx = Number(evt.data.sectionIndex ?? 0) + 1;
              const total = Number(evt.data.totalSections ?? 1);
              setStatusMessage(
                sectionType
                  ? `Generating ${sectionType}… (${idx}/${total})`
                  : "Generating…"
              );
              setGenerationState("generating");
            } else if (evt.event === "section_complete") {
              const assembled = evt.data.assembledHtml as string | undefined;
              if (assembled) {
                setPreviewHtml(assembled);
              } else {
                // Fallback: append by string concatenation
                const sectionHtml = evt.data.sectionHtml ?? "";
                const prev = useWorkspaceStore.getState().previewHtml ?? "";
                setPreviewHtml(prev + sectionHtml);
              }
            } else if (evt.event === "complete") {
              if (evt.data.versionNumber) {
                setActiveVersionNumber(evt.data.versionNumber);
              }
              if (evt.data.html) {
                setPreviewHtml(evt.data.html);
              }
              setGenerationState("complete");
              setStatusMessage(null);
            } else if (evt.event === "error") {
              setGenerationError(evt.data ?? { code: "UNKNOWN", message: "Generation failed" });
              setGenerationState("error");
              setStatusMessage("Generation failed. Please try again.");
            }
          }
        }

        // Final flush to ensure any remaining chunk content appears.
        if (useWorkspaceStore.getState().streamedHtml !== streamedHtml) {
          setPreviewHtml(useWorkspaceStore.getState().streamedHtml);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setGenerationError({
          code: err?.code ?? "NETWORK_ERROR",
          message: err?.message ?? "Generation failed",
          retryable: true,
        });
        setGenerationState("error");
        setStatusMessage("Generation failed. Please try again.");
      } finally {
        abortRef.current = null;
      }
    },
    [
      stopGeneration,
      resetGeneration,
      setGenerationState,
      setGenerationError,
      setActiveDesignId,
      setLastGenerationMeta,
      setStatusMessage,
      appendStreamChunk,
      schedulePreviewFlush,
      setPreviewHtml,
      setActiveVersionNumber,
      streamedHtml,
      setLastPrompt,
    ]
  );

  useEffect(() => {
    return () => {
      stopGeneration();
      if (throttleTimerRef.current != null) {
        window.clearTimeout(throttleTimerRef.current);
      }
    };
  }, [stopGeneration]);

  return {
    startGeneration,
    stopGeneration,
  };
}

