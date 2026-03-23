import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ActiveModal = "none" | "createBrand" | "export" | "settings" | "shortcuts";
type PanelLayout = "split" | "preview-only" | "editor-only";
type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  type?: "success" | "error" | "info";
};

interface UIState {
  isSidebarOpen: boolean;
  activeModal: ActiveModal;
  toastQueue: ToastItem[];
  workspacePanelLayout: PanelLayout;
  showShortcuts: boolean;
  dashboardRecentPlatformFilter: "all" | "instagram" | "linkedin" | "twitter" | "facebook" | "website" | "dashboard" | "mobile";
  analyticsPeriod: AnalyticsPeriod;
  setDashboardRecentPlatformFilter: (
    f: UIState["dashboardRecentPlatformFilter"]
  ) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveModal: (modal: ActiveModal) => void;
  enqueueToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  setShowShortcuts: (show: boolean) => void;
  setAnalyticsPeriod: (p: AnalyticsPeriod) => void;
}

export const useUIStore = create<UIState>()(
  devtools((set) => ({
    isSidebarOpen: true,
    activeModal: "none",
    toastQueue: [],
    workspacePanelLayout: "split",
    showShortcuts: false,
    dashboardRecentPlatformFilter: "all",
    analyticsPeriod: "30d",
    setDashboardRecentPlatformFilter: (f) => set({ dashboardRecentPlatformFilter: f }),
    setSidebarOpen: (open) => set({ isSidebarOpen: open }),
    setActiveModal: (modal) => set({ activeModal: modal }),
    enqueueToast: (toast) =>
      set((state) => ({
        toastQueue: [...state.toastQueue, { id: crypto.randomUUID(), ...toast }],
      })),
    removeToast: (id) =>
      set((state) => ({
        toastQueue: state.toastQueue.filter((t) => t.id !== id),
      })),
    clearToasts: () => set({ toastQueue: [] }),
    setShowShortcuts: (show) => set({ showShortcuts: show }),
    setAnalyticsPeriod: (p) => set({ analyticsPeriod: p }),
  }))
);
