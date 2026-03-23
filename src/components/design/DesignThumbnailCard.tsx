"use client";

import Image from "next/image";
import { Facebook, Globe, Instagram, LayoutDashboard, Linkedin, Smartphone, Twitter } from "lucide-react";

type Props = {
  platform: string;
  format: string;
  previewUrl: string | null;
  brandPrimaryColor: string;
  promptSnippet: string;
  status: string;
};

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  switch (p) {
    case "instagram":
      return <Instagram className="h-4 w-4" />;
    case "linkedin":
      return <Linkedin className="h-4 w-4" />;
    case "facebook":
      return <Facebook className="h-4 w-4" />;
    case "twitter":
    case "x":
      return <Twitter className="h-4 w-4" />;
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "dashboard":
      return <LayoutDashboard className="h-4 w-4" />;
    default:
      return <Globe className="h-4 w-4" />;
  }
}

export function DesignThumbnailCard({
  platform,
  format,
  previewUrl,
  brandPrimaryColor,
  promptSnippet,
  status,
}: Props) {
  const isGenerating = status === "generating";
  return (
    <div className="group overflow-hidden rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      {previewUrl ? (
        <div className="relative h-28 w-full">
          <Image src={previewUrl} alt={`${platform} thumbnail`} fill unoptimized className="object-cover" />
        </div>
      ) : (
        <div className="relative flex h-28 w-full items-center justify-center bg-[hsl(var(--background))]">
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: brandPrimaryColor }} />
          <div className="px-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
            {isGenerating ? "Generating..." : `${platform} ${format}`}
          </div>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="text-[hsl(var(--muted-foreground))]">{platformIcon(platform)}</div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="truncate text-sm font-semibold">{platform}</div>
            <div className="truncate text-[10px] text-[hsl(var(--muted-foreground))]">{format}</div>
          </div>
          <span
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
          >
            {status}
          </span>
        </div>

        {promptSnippet ? (
          <div className="mt-2 line-clamp-2 text-[10px] text-[hsl(var(--subtle-foreground))]">
            {promptSnippet}
          </div>
        ) : null}

        <div className="mt-2 h-1.5 w-full bg-[hsl(var(--surface-elevated))]">
          <div className="h-1.5 bg-[hsl(var(--accent))]" style={{ width: previewUrl || !isGenerating ? "100%" : "35%" }} />
        </div>
      </div>
    </div>
  );
}
