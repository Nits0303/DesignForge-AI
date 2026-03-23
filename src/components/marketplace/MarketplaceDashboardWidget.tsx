"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; previewUrl: string | null; previewImages?: unknown };

export function MarketplaceDashboardWidget() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/templates/marketplace?sort=newest&limit=4");
      const json = await res.json();
      if (json.success) setItems(json.data.items ?? []);
    })();
  }, []);

  if (items.length === 0) return null;

  const thumb = (t: Item) => {
    const imgs = t.previewImages as string[] | undefined;
    if (imgs?.[0]) return imgs[0];
    return t.previewUrl;
  };

  return (
    <div className="mb-8 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">New in the marketplace</div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Fresh community templates</div>
        </div>
        <Link href="/templates" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Browse marketplace
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((t) => (
          <Link
            key={t.id}
            href={`/templates/${t.id}`}
            className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] transition hover:border-[hsl(var(--accent))]"
          >
            <div className="aspect-[4/3] bg-[hsl(var(--background))]">
              {thumb(t) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb(t)!} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-[hsl(var(--muted-foreground))]">
                  Preview
                </div>
              )}
            </div>
            <div className="line-clamp-2 p-2 text-[11px] font-medium">{t.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
