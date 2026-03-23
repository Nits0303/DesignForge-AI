import { Suspense } from "react";
import { ContributePageClient } from "@/components/marketplace/ContributePageClient";

export const metadata = {
  title: "Contribute a Template | DesignForge AI",
};

export default function ContributeTemplatePage() {
  return (
    <Suspense fallback={<div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>}>
      <ContributePageClient />
    </Suspense>
  );
}
