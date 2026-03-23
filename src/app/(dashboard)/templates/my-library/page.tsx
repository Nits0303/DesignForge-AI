import { Suspense } from "react";
import { MyLibraryClient } from "@/components/marketplace/MyLibraryClient";

export const metadata = {
  title: "My template library | DesignForge AI",
};

export default function MyLibraryPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>}>
      <MyLibraryClient />
    </Suspense>
  );
}
