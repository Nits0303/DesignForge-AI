import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ActiveModal = "none" | "createBrand" | "export" | "settings" | "shortcuts";
type PanelLayout = "split" | "preview-only" | "editor-only";

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
  setDashboardRecentPlatformFilter: (
    f: UIState["dashboardRecentPlatformFilter"]
  ) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveModal: (modal: ActiveModal) => void;
  enqueueToast: (toast: Omit<ToastItem, "id">) => void;
  clearToasts: () => void;
  setShowShortcuts: (show: boolean) => void;
}

export const useUIStore = create<UIState>()(
  devtools((set) => ({
    isSidebarOpen: true,
    activeModal: "none",
    toastQueue: [],
    workspacePanelLayout: "split",
    showShortcuts: false,
    dashboardRecentPlatformFilter: "all",
    setDashboardRecentPlatformFilter: (f) => set({ dashboardRecentPlatformFilter: f }),
    setSidebarOpen: (open) => set({ isSidebarOpen: open }),
    setActiveModal: (modal) => set({ activeModal: modal }),
    enqueueToast: (toast) =>
      set((state) => ({
        toastQueue: [...state.toastQueue, { id: crypto.randomUUID(), ...toast }],
      })),
    clearToasts: () => set({ toastQueue: [] }),
    setShowShortcuts: (show) => set({ showShortcuts: show }),
  }))
);
