"use client";

import Link from "next/link";
import { DesignThumbnailCard } from "@/components/design/DesignThumbnailCard";

type DesignSummary = {
  id: string;
  title: string;
  platform: string;
  format: string;
  status: string;
  previewUrl: string | null;
  brandPrimaryColor?: string;
  promptSnippet?: string;
};

function DesignCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] animate-pulse">
      <div className="h-28 w-full bg-[hsl(var(--surface-elevated))]" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-2/3 rounded bg-[hsl(var(--surface-elevated))]" />
        <div className="h-3 w-1/2 rounded bg-[hsl(var(--surface-elevated))]" />
      </div>
    </div>
  );
}

export function DesignCard({ design, loading }: { design?: DesignSummary; loading?: boolean }) {
  if (loading || !design) return <DesignCardSkeleton />;

  return (
    <Link href={`/workspace?designId=${design.id}`} className="block">
      <DesignThumbnailCard
        platform={design.platform}
        format={design.format}
        previewUrl={design.previewUrl}
        brandPrimaryColor={design.brandPrimaryColor ?? "#6366f1"}
        promptSnippet={design.promptSnippet ?? ""}
        status={design.status}
      />
      <div className="mt-2 truncate px-1 text-xs font-semibold text-[hsl(var(--foreground))]">{design.title}</div>
    </Link>
  );
}
