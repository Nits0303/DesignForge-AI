 "use client";

import { useRouter } from "next/navigation";
import { BrandWizard, DEFAULT_BRAND_STATE, type BrandWizardState } from "@/components/brand/BrandWizard";

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <BrandWizard
      mode="onboarding"
      initial={DEFAULT_BRAND_STATE}
      onSkip={() => router.push("/dashboard")}
      onComplete={async (payload: BrandWizardState) => {
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload.name || "My Brand",
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
        router.push("/dashboard");
      }}
    />
  );
}
