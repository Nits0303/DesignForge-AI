import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Design, DesignVersion } from "@/types/design";
import type { ReferenceAnalysis } from "@/types/ai";
import type { MobileDeviceId } from "@/constants/mobileDevices";
import { DEFAULT_MOBILE_DEVICE_ID } from "@/constants/mobileDevices";

export type RevisionMessageRole = "user" | "assistant" | "system" | "error";

export type RevisionMessage = {
  id: string;
  role: RevisionMessageRole;
  content: string;
  createdAt: string;
  isQueued?: boolean;
  targetSection?: string | null;
};

export type RevisionQueueItem = {
  id: string;
  designId: string;
  revisionPrompt: string;
  slideIndex?: number;
  referenceImageUrl?: string | null;
  referenceIds?: string[];
  referenceRoles?: Record<string, "layout" | "style" | "color">;
};

export type ActiveReference = {
  referenceId: string;
  visionUrl: string;
  thumbnailUrl: string;
  role: "layout" | "style" | "color";
  applying: boolean;
  analysis: ReferenceAnalysis | null;
  analysisLoading?: boolean;
};

type ExportStatus = "idle" | "processing" | "done" | "error";
type GenerationState =
  | "idle"
  | "connecting"
  | "generating"
  | "processing_images"
  | "complete"
  | "error";
type PreviewMode = "fit" | "actual";
type Breakpoint = "desktop" | "tablet" | "mobile";

interface WorkspaceState {
  currentDesign: Design | null;
  versionHistory: DesignVersion[];
  activeVersionNumber: number | null;
  currentHtmlContent: string; // legacy compatibility
  isGenerating: boolean; // legacy compatibility
  revisionChatMessages: RevisionMessage[]; // legacy compatibility
  activeBrandProfileId: string | null;
  exportStatus: ExportStatus;
  generationState: GenerationState;
  streamedHtml: string;
  activeDesignId: string | null;
  previewHtml: string;
  revisionMessages: RevisionMessage[];
  generationError: { code: string; message: string; retryable?: boolean } | null;
  statusMessage: string | null;
  activeSlide: number;
  zoomLevel: number;
  previewMode: PreviewMode;
  breakpoint: Breakpoint;
  versionFlashNonce: number;
  referenceImageUrl: string | null;
  activeReferences: ActiveReference[];
  revisionInProgress: boolean;
  hoveredSectionType: string | null;
  setHoveredSectionType: (t: string | null) => void;
  scrollToSectionType: string | null;
  setScrollToSectionType: (t: string | null) => void;
  lastPrompt: string;
  lastGenerationMeta: {
    model?: string;
    estimatedTokens?: number;
    platform?: string;
    format?: string;
    dimensions?: { width: number; height: number | "auto" } | null;
    sectionPlan?: string[] | null;
    sectionCount?: number | null;
  } | null;

  /** Mobile preview device + orientation (Sprint 14). */
  activeDeviceId: MobileDeviceId;
  deviceOrientation: "portrait" | "landscape";
  setActiveDeviceId: (id: MobileDeviceId) => void;
  setDeviceOrientation: (o: "portrait" | "landscape") => void;

  // Revision queue (FIFO, max 3)
  revisionQueue: RevisionQueueItem[];
  activeRevisionQueueId: string | null;

  setCurrentHtmlContent: (html: string) => void;
  setActiveBrandProfileId: (id: string | null) => void;
  setGenerating: (value: boolean) => void;
  resetGeneration: () => void;
  setGenerationState: (state: GenerationState) => void;
  appendStreamChunk: (htmlChunk: string) => void;
  setPreviewHtml: (html: string) => void;
  setActiveDesignId: (id: string | null) => void;
  setActiveVersionNumber: (v: number | null) => void;
  setVersionHistory: (versions: DesignVersion[]) => void;
  addRevisionMessage: (msg: Omit<RevisionMessage, "id" | "createdAt">) => void;
  updateRevisionMessage: (id: string, patch: Partial<RevisionMessage>) => void;
  setRevisionMessages: (messages: RevisionMessage[]) => void;
  setGenerationError: (
    err: { code: string; message: string; retryable?: boolean } | null
  ) => void;
  setStatusMessage: (message: string | null) => void;
  setActiveSlide: (slide: number) => void;
  setZoomLevel: (zoom: number) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setBreakpoint: (bp: Breakpoint) => void;
  triggerVersionFlash: () => void;
  setReferenceImageUrl: (url: string | null) => void;
  setActiveReferences: (refs: ActiveReference[]) => void;
  upsertActiveReference: (ref: ActiveReference) => void;
  removeActiveReference: (referenceId: string) => void;
  updateReferenceAnalysis: (referenceId: string, analysis: ReferenceAnalysis | null) => void;
  setRevisionInProgress: (value: boolean) => void;
  setLastPrompt: (prompt: string) => void;
  setLastGenerationMeta: (meta: WorkspaceState["lastGenerationMeta"]) => void;

  // Queue actions
  enqueueRevision: (item: Omit<RevisionQueueItem, "id">) => boolean; // returns false if queue full
  dequeueRevision: () => RevisionQueueItem | undefined;
  setActiveRevisionQueueId: (id: string | null) => void;

  /** When set, assign `projectId` on the active design after idle (no generation/revisions). */
  deferredProjectId: string | null;
  deferredProjectName: string | null;
  setDeferredProject: (id: string | null, name?: string | null) => void;
  clearDeferredProject: () => void;
  /** Bumped after server-side design updates so Details panel refetches. */
  workspaceDesignSyncNonce: number;
  bumpWorkspaceDesignSync: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools((set, get) => ({
    currentDesign: null,
    versionHistory: [],
    activeVersionNumber: null,
    currentHtmlContent: "",
    isGenerating: false,
    revisionChatMessages: [],
    activeBrandProfileId: null,
    exportStatus: "idle",
    generationState: "idle",
    streamedHtml: "",
    activeDesignId: null,
    previewHtml: "",
    revisionMessages: [],
    generationError: null,
    statusMessage: null,
    activeSlide: 0,
    zoomLevel: 1,
    previewMode: "fit",
    breakpoint: "desktop",
    versionFlashNonce: 0,
    referenceImageUrl: null,
    activeReferences: [],
    revisionInProgress: false,
    hoveredSectionType: null,
    scrollToSectionType: null,
    lastPrompt: "",
    lastGenerationMeta: null,
    activeDeviceId: DEFAULT_MOBILE_DEVICE_ID,
    deviceOrientation: "portrait",
    revisionQueue: [],
    activeRevisionQueueId: null,
    deferredProjectId: null,
    deferredProjectName: null,
    workspaceDesignSyncNonce: 0,

    setCurrentHtmlContent: (html) => set({ currentHtmlContent: html }),
    setActiveBrandProfileId: (id) => set({ activeBrandProfileId: id }),
    setGenerating: (value) => set({ isGenerating: value }),
    resetGeneration: () =>
      set({
        generationState: "idle",
        streamedHtml: "",
        previewHtml: "",
        generationError: null,
        statusMessage: "Preparing your design...",
        activeSlide: 0,
        isGenerating: false,
      }),
    setGenerationState: (state) =>
      set({
        generationState: state,
        statusMessage:
          state === "connecting"
            ? "Preparing your design..."
            : state === "generating"
            ? "Generating layout..."
            : state === "processing_images"
            ? "Sourcing images..."
            : state === "complete"
            ? "Finalising..."
            : state === "error"
            ? "Generation failed. Please try again."
            : null,
        isGenerating: state === "connecting" || state === "generating" || state === "processing_images",
      }),
    appendStreamChunk: (htmlChunk) =>
      set((s) => ({
        streamedHtml: s.streamedHtml + htmlChunk,
      })),
    setPreviewHtml: (html) =>
      set({
        previewHtml: html,
        currentHtmlContent: html,
      }),
    setActiveDesignId: (id) => set({ activeDesignId: id }),
    setActiveVersionNumber: (v) => set({ activeVersionNumber: v }),
    setVersionHistory: (versions) => set({ versionHistory: versions }),
    addRevisionMessage: (msg) =>
      set((s) => {
        const newMsg: RevisionMessage = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...msg,
        };
        return {
          revisionMessages: [...s.revisionMessages, newMsg],
          revisionChatMessages: [...s.revisionChatMessages, newMsg],
        };
      }),
    updateRevisionMessage: (id, patch) =>
      set((s) => ({
        revisionMessages: s.revisionMessages.map((m) =>
          m.id === id ? { ...m, ...patch } : m
        ),
        revisionChatMessages: s.revisionChatMessages.map((m) =>
          m.id === id ? { ...m, ...patch } : m
        ),
      })),
    setRevisionMessages: (messages) =>
      set({
        revisionMessages: messages,
        revisionChatMessages: messages,
      }),
    setGenerationError: (err) => set({ generationError: err }),
    setStatusMessage: (message) => set({ statusMessage: message }),
    setActiveSlide: (slide) => set({ activeSlide: Math.max(0, slide) }),
    setZoomLevel: (zoom) => set({ zoomLevel: Math.max(0.25, Math.min(2, zoom)) }),
    setPreviewMode: (mode) => set({ previewMode: mode }),
    setBreakpoint: (bp) => set({ breakpoint: bp }),
    triggerVersionFlash: () => set((s) => ({ versionFlashNonce: s.versionFlashNonce + 1 })),
    setReferenceImageUrl: (url) => set({ referenceImageUrl: url }),
    setActiveReferences: (refs) => set({ activeReferences: refs.slice(0, 3) }),
    upsertActiveReference: (ref) =>
      set((s) => {
        const existingIdx = s.activeReferences.findIndex((r) => r.referenceId === ref.referenceId);
        if (existingIdx >= 0) {
          const next = [...s.activeReferences];
          next[existingIdx] = ref;
          return { activeReferences: next };
        }
        return { activeReferences: [...s.activeReferences, ref].slice(0, 3) };
      }),
    removeActiveReference: (referenceId) =>
      set((s) => ({
        activeReferences: s.activeReferences.filter((r) => r.referenceId !== referenceId),
      })),
    updateReferenceAnalysis: (referenceId, analysis) =>
      set((s) => ({
        activeReferences: s.activeReferences.map((r) =>
          r.referenceId === referenceId ? { ...r, analysis, analysisLoading: false } : r
        ),
      })),
    setRevisionInProgress: (value) => set({ revisionInProgress: value }),
    setHoveredSectionType: (t) => set({ hoveredSectionType: t }),
    setScrollToSectionType: (t) => set({ scrollToSectionType: t }),
    setLastPrompt: (prompt) => set({ lastPrompt: prompt }),
    setLastGenerationMeta: (meta) => set({ lastGenerationMeta: meta }),
    setActiveDeviceId: (id) => set({ activeDeviceId: id }),
    setDeviceOrientation: (o) => set({ deviceOrientation: o }),

    enqueueRevision: (item) => {
      const state = get();
      if (state.revisionQueue.length >= 3) return false;
      const newItem: RevisionQueueItem = { id: crypto.randomUUID(), ...item };
      set((s) => ({ revisionQueue: [...s.revisionQueue, newItem] }));
      return true;
    },
    dequeueRevision: () => {
      const state = get();
      const [first, ...rest] = state.revisionQueue;
      if (!first) return undefined;
      set({ revisionQueue: rest });
      return first;
    },
    setActiveRevisionQueueId: (id) => set({ activeRevisionQueueId: id }),

    setDeferredProject: (id, name = null) =>
      set({
        deferredProjectId: id,
        deferredProjectName: name ?? null,
      }),
    clearDeferredProject: () => set({ deferredProjectId: null, deferredProjectName: null }),
    bumpWorkspaceDesignSync: () =>
      set((s) => ({ workspaceDesignSyncNonce: s.workspaceDesignSyncNonce + 1 })),
  }))
);
