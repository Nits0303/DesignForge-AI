"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2, Copy, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { BrandProfile } from "@/types/brand";
import { BrandPreviewCard } from "@/components/brand/BrandPreviewCard";

type Props = {
  initialBrands: BrandProfile[];
};

function formatDate(iso: string | Date | undefined) {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString();
}

export function BrandsGrid({ initialBrands }: Props) {
  const [brands, setBrands] = useState<BrandProfile[]>(initialBrands);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<BrandProfile | null>(null);

  useEffect(() => setBrands(initialBrands), [initialBrands]);

  const empty = brands.length === 0;

  const cards = useMemo(() => brands, [brands]);

  const setDefault = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/brands/${id}/set-default`, { method: "PUT" });
      if (res.ok) {
        const j = await res.json();
        if (j.success) {
          const updated = j.data as BrandProfile;
          setBrands((prev) =>
            prev.map((b) => ({
              ...b,
              isDefault: b.id === updated.id,
            }))
          );
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/brands/${id}/duplicate`, { method: "POST" });
      const j = await res.json();
      if (res.ok && j.success) {
        setBrands((prev) => [j.data as BrandProfile, ...prev]);
      }
    } finally {
      setBusyId(null);
    }
  };

  const del = async (id: string) => {
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
      if (res.status === 204) {
        setBrands((prev) => prev.filter((x) => x.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  if (empty) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-10 text-center">
        <div className="mx-auto max-w-md">
          <div className="text-lg font-semibold">Create your first brand profile</div>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Brand profiles help the AI generate consistent layouts aligned with your identity.
          </p>
          <div className="mt-6">
            <Link href="/brands/new">
              <Button>Create Brand Profile</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((b) => {
        const colors = (b.colors ?? {}) as any;
        const typography = (b.typography ?? {}) as any;
        return (
          <div
            key={b.id}
            className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-base font-semibold">{b.name}</div>
                  {b.isDefault ? (
                    <span className="rounded-full bg-[hsl(var(--accent-muted))] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--accent))]">
                      Default
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full bg-[hsl(var(--surface-elevated))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                    {b.industry ?? "—"}
                  </span>
                  <span className="text-xs text-[hsl(var(--subtle-foreground))]">
                    Created {formatDate((b as any).createdAt)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  {(["primary", "secondary", "accent", "background", "text"] as const).map((k) => (
                    <span
                      key={k}
                      className="h-3 w-3 rounded-full border border-[hsl(var(--border))]"
                      style={{ background: colors[k] ?? "#111827" }}
                      title={k}
                    />
                  ))}
                </div>
                <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold text-[hsl(var(--foreground))]">Fonts:</span>{" "}
                  {typography.headingFont ?? "—"} / {typography.bodyFont ?? "—"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/brands/${b.id}`}>
                  <Button variant="secondary" size="sm">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const el = document.getElementById(`menu-${b.id}`);
                      if (el) el.classList.toggle("hidden");
                    }}
                    aria-label="Open brand menu"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                  <div
                    id={`menu-${b.id}`}
                    className="hidden absolute right-0 mt-2 w-44 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-1"
                  >
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => setDefault(b.id)}
                      className="flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--accent-muted))]"
                    >
                      <Star className="h-4 w-4" />
                      Set as Default
                    </button>
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => duplicate(b.id)}
                      className="flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--accent-muted))]"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => setBrandToDelete(b)}
                      className="flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <BrandPreviewCard brand={b} />
            </div>
          </div>
        );
      })}
      </div>

      <Dialog open={!!brandToDelete} onOpenChange={() => setBrandToDelete(null)}>
        <DialogContent className="max-w-sm">
          {brandToDelete && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                Delete brand “{brandToDelete.name}”
              </h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                This will remove the brand profile from your account. Designs created with
                this brand will remain. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBrandToDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!brandToDelete) return;
                    await del(brandToDelete.id);
                    setBrandToDelete(null);
                  }}
                  disabled={busyId === brandToDelete.id}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

