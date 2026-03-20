"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandWizard, DEFAULT_BRAND_STATE, type BrandWizardState } from "@/components/brand/BrandWizard";

export default function NewBrandPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/brands");
      const j = await res.json();
      if (res.ok && j.success) {
        setBrands((j.data as any[]).map((b) => ({ id: b.id, name: b.name })));
      }
    })();
  }, []);

  return (
    <BrandWizard
      mode="new"
      allowCopyFromExisting
      existingBrands={brands}
      initial={DEFAULT_BRAND_STATE}
      onComplete={async (payload: BrandWizardState) => {
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload.name || "New Brand",
            industry: payload.industry || null,
            toneVoice: payload.toneVoice || null,
            colors: payload.colors,
            typography: payload.typography,
            logoPrimaryUrl: payload.logoPrimaryUrl || null,
            logoIconUrl: payload.logoIconUrl || null,
            logoDarkUrl: payload.logoDarkUrl || null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message ?? "Failed to create brand");
        }
        router.push(`/brands/${json.data.id}`);
      }}
    />
  );
}

