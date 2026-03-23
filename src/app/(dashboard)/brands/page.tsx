"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandsGrid } from "@/components/brand/BrandsGrid";
import { Button } from "@/components/ui/button";
import type { BrandProfile } from "@/types/brand";

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandProfile[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/brands");
        const json = await res.json();
        if (mounted && res.ok && json?.success) {
          setBrands((json.data ?? []) as BrandProfile[]);
        }
      } catch {
        // noop
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Brand Profiles</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Brand profiles are injected into every generation to keep designs consistent.
          </p>
        </div>
        <Link href="/brands/new">
          <Button>Create New Brand</Button>
        </Link>
      </div>

      <BrandsGrid initialBrands={brands as any} />
    </div>
  );
}

