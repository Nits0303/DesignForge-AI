import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { BrandProfile } from "@/types/brand";

interface BrandState {
  brands: BrandProfile[];
  activeBrandId: string | null;
  setBrands: (brands: BrandProfile[]) => void;
  setActiveBrandId: (brandId: string | null) => void;
}

export const useBrandStore = create<BrandState>()(
  devtools((set) => ({
    brands: [],
    activeBrandId: null,
    setBrands: (brands) => set({ brands }),
    setActiveBrandId: (brandId) => set({ activeBrandId: brandId }),
  }))
);

