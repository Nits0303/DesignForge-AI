"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useUIStore } from "@/store/useUIStore";
import { DEFERRED_PROJECT_IDLE_MS } from "@/constants/deferredProjectAttach";

/**
 * When the user picks "add to project after finishing revisions", assign `projectId`
 * only after generation and the revision queue have been idle for DEFERRED_PROJECT_IDLE_MS.
 */
export function useDeferredProjectAssignment() {
  const enqueueToast = useUIStore((s) => s.enqueueToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deferredProjectId = useWorkspaceStore((s) => s.deferredProjectId);
  const clearDeferredProject = useWorkspaceStore((s) => s.clearDeferredProject);
  const bumpWorkspaceDesignSync = useWorkspaceStore((s) => s.bumpWorkspaceDesignSync);

  const activeDesignId = useWorkspaceStore((s) => s.activeDesignId);
  const generationState = useWorkspaceStore((s) => s.generationState);
  const revisionInProgress = useWorkspaceStore((s) => s.revisionInProgress);
  const revisionQueue = useWorkspaceStore((s) => s.revisionQueue);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!deferredProjectId || !activeDesignId) {
      clearTimer();
      return;
    }

    const busyGenerating =
      generationState === "connecting" ||
      generationState === "generating" ||
      generationState === "processing_images";

    if (busyGenerating || revisionInProgress || revisionQueue.length > 0) {
      clearTimer();
      return;
    }

    clearTimer();
    timerRef.current = window.setTimeout(async () => {
      timerRef.current = null;
      const designId = useWorkspaceStore.getState().activeDesignId;
      const projectId = useWorkspaceStore.getState().deferredProjectId;
      if (!designId || !projectId) return;

      try {
        const check = await fetch(`/api/design/${designId}`);
        const checkJson = await check.json();
        if (!check.ok || !checkJson.success) return;
        if (checkJson.data?.projectId) {
          useWorkspaceStore.getState().clearDeferredProject();
          enqueueToast({
            title: "Already in a project",
            description: "This design is already linked to a project.",
            type: "info",
          });
          return;
        }

        const put = await fetch(`/api/design/${designId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        const putJson = await put.json();
        if (!put.ok || !putJson.success) {
          enqueueToast({
            title: "Could not add to project",
            description: putJson?.error?.message ?? "Update failed",
            type: "error",
          });
          return;
        }

        const label = useWorkspaceStore.getState().deferredProjectName ?? "project";
        useWorkspaceStore.getState().clearDeferredProject();
        bumpWorkspaceDesignSync();
        enqueueToast({
          title: "Added to project",
          description: `This design is now in “${label}”.`,
          type: "success",
        });
      } catch {
        enqueueToast({
          title: "Could not add to project",
          description: "Network error. Try again from the Details tab.",
          type: "error",
        });
      }
    }, DEFERRED_PROJECT_IDLE_MS);

    return () => {
      clearTimer();
    };
  }, [
    activeDesignId,
    deferredProjectId,
    generationState,
    revisionInProgress,
    revisionQueue.length,
    bumpWorkspaceDesignSync,
    clearDeferredProject,
    enqueueToast,
  ]);
}
