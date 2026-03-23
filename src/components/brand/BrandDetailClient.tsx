"use client";

import { useMemo, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { BrandPreviewCard } from "@/components/brand/BrandPreviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Brand = any;

const FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Source Sans Pro",
  "Playfair Display",
  "Merriweather",
  "Oswald",
] as const;

export function BrandDetailClient({ initialBrand }: { initialBrand: Brand }) {
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState<null | keyof any>(null);
  const [assetToDelete, setAssetToDelete] = useState<string | null>(null);
  const [showDeleteBrand, setShowDeleteBrand] = useState(false);
  const [deleteBrandInput, setDeleteBrandInput] = useState("");

  const colors = useMemo(() => ({ ...(brand.colors ?? {}) }), [brand]);
  const typography = useMemo(() => ({ ...(brand.typography ?? {}) }), [brand]);

  const save = async (patch: any) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setError(j.error?.message ?? "Failed to save");
        return;
      }
      setBrand(j.data);
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (file: File, category: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    const res = await fetch(`/api/brands/${brand.id}/assets`, { method: "POST", body: fd });
    const j = await res.json();
    if (res.ok && j.success) {
      setBrand((b: any) => ({ ...b, assets: [j.data, ...(b.assets ?? [])] }));
    } else {
      setError(j.error?.message ?? "Upload failed");
    }
  };

  const deleteAsset = async (assetId: string) => {
    const res = await fetch(`/api/brands/${brand.id}/assets/${assetId}`, { method: "DELETE" });
    if (res.status === 204) {
      setBrand((b: any) => ({ ...b, assets: (b.assets ?? []).filter((a: any) => a.id !== assetId) }));
    } else {
      const j = await res.json().catch(() => null);
      setError(j?.error?.message ?? "Delete failed");
    }
  };

  const setDefault = async () => {
    const res = await fetch(`/api/brands/${brand.id}/set-default`, { method: "PUT" });
    const j = await res.json();
    if (res.ok && j.success) {
      setBrand((b: any) => ({ ...b, isDefault: true }));
    } else {
      setError(j.error?.message ?? "Failed");
    }
  };

  const duplicate = async () => {
    const res = await fetch(`/api/brands/${brand.id}/duplicate`, { method: "POST" });
    const j = await res.json();
    if (res.ok && j.success) {
      window.location.href = `/brands/${j.data.id}`;
    } else {
      setError(j.error?.message ?? "Failed");
    }
  };

  const setLogo = async (
    field: "logoPrimaryUrl" | "logoIconUrl" | "logoDarkUrl",
    url: string
  ) => {
    await save({ [field]: url });
  };

  const deleteBrand = async () => {
    if (deleteBrandInput !== brand.name) {
      setError("Brand name does not match.");
      return;
    }
    const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    if (res.status === 204) {
      window.location.href = "/brands";
    } else {
      const j = await res.json().catch(() => null);
      setError(j?.error?.message ?? "Delete failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="space-y-10">
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--accent))]">
              Brand profile
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[hsl(var(--foreground))] sm:text-2xl">
              {brand.name}
            </h1>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] sm:text-sm">
              Tweak identity, colors, typography and assets. Changes are saved as you go.
            </p>
            {error ? (
              <div className="mt-3 rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
                {error}
              </div>
            ) : null}
          </div>
          <Button onClick={() => save({})} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <section id="identity" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] sm:text-base">
              Identity
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Core information that appears across previews and prompts.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Brand name
              </label>
              <Input
                value={brand.name ?? ""}
                onChange={(e) => setBrand((b: any) => ({ ...b, name: e.target.value }))}
                onBlur={() => save({ name: brand.name })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Industry
              </label>
              <Input
                value={brand.industry ?? ""}
                onChange={(e) => setBrand((b: any) => ({ ...b, industry: e.target.value }))}
                onBlur={() => save({ industry: brand.industry })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Tone &amp; voice
            </label>
            <Textarea
              value={brand.toneVoice ?? ""}
              onChange={(e) => setBrand((b: any) => ({ ...b, toneVoice: e.target.value }))}
              onBlur={() => save({ toneVoice: brand.toneVoice })}
            />
          </div>
          <div className="text-xs text-[hsl(var(--subtle-foreground))]">
            Last updated{" "}
            <span className="font-medium text-[hsl(var(--muted-foreground))]">
              {new Date(brand.updatedAt).toLocaleString()}
            </span>
          </div>
        </section>

        <section id="colors" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] sm:text-base">
              Colors
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Define the palette used in previews and generated layouts.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-4 sm:grid-cols-2">
              {(["primary", "secondary", "accent", "background", "text"] as const).map((k) => (
                <div key={k} className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold capitalize">{k}</div>
                    <button
                      type="button"
                      className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      onClick={() => {
                        const defaults: any = {
                          primary: "#6366f1",
                          secondary: "#8b5cf6",
                          accent: "#a78bfa",
                          background: "#0f172a",
                          text: "#f8fafc",
                        };
                        const next = { ...colors, [k]: defaults[k] };
                        setBrand((b: any) => ({ ...b, colors: next }));
                        save({ colors: next });
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerKey(k)}
                    className="mt-3 h-14 w-full rounded border border-[hsl(var(--border))]"
                    style={{ background: colors[k] ?? "#111827" }}
                  />
                  <Input
                    className="mt-3 font-mono"
                    value={colors[k] ?? ""}
                    onChange={(e) => {
                      const next = { ...colors, [k]: e.target.value };
                      setBrand((b: any) => ({ ...b, colors: next }));
                    }}
                    onBlur={() => save({ colors })}
                  />
                  {pickerKey === k ? (
                    <div className="mt-3">
                      <HexColorPicker
                        color={colors[k] ?? "#111827"}
                        onChange={(v) => {
                          const next = { ...colors, [k]: v };
                          setBrand((b: any) => ({ ...b, colors: next }));
                        }}
                        style={{ width: "100%", height: 120 }}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            save({ colors });
                            setPickerKey(null);
                          }}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="hidden lg:block">
              <div className="sticky top-20">
                <div className="text-sm font-semibold mb-2">Live preview</div>
                <BrandPreviewCard brand={brand} />
              </div>
            </div>
          </div>
        </section>

        <section id="typography" className="space-y-4">
          <h2 className="text-xl font-semibold">Typography</h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Heading font</label>
                <select
                  value={typography.headingFont ?? "Inter"}
                  onChange={(e) => {
                    const next = { ...typography, headingFont: e.target.value };
                    setBrand((b: any) => ({ ...b, typography: next }));
                  }}
                  onBlur={() => save({ typography })}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                >
                  {FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Body font</label>
                <select
                  value={typography.bodyFont ?? "Inter"}
                  onChange={(e) => {
                    const next = { ...typography, bodyFont: e.target.value };
                    setBrand((b: any) => ({ ...b, typography: next }));
                  }}
                  onBlur={() => save({ typography })}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                >
                  {FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Heading weight</label>
                <select
                  value={typography.headingWeight ?? 700}
                  onChange={(e) => {
                    const next = { ...typography, headingWeight: Number(e.target.value) };
                    setBrand((b: any) => ({ ...b, typography: next }));
                  }}
                  onBlur={() => save({ typography })}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                >
                  <option value={700}>Bold 700</option>
                  <option value={600}>Semibold 600</option>
                  <option value={500}>Medium 500</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Body weight</label>
                <select
                  value={typography.bodyWeight ?? 400}
                  onChange={(e) => {
                    const next = { ...typography, bodyWeight: Number(e.target.value) };
                    setBrand((b: any) => ({ ...b, typography: next }));
                  }}
                  onBlur={() => save({ typography })}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                >
                  <option value={400}>Regular 400</option>
                  <option value={500}>Medium 500</option>
                </select>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="sticky top-20 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div
                  className="text-xl font-bold"
                  style={{ fontFamily: typography.headingFont ?? "Inter", fontWeight: typography.headingWeight ?? 700 }}
                >
                  Headline preview
                </div>
                <div
                  className="mt-2 text-sm text-[hsl(var(--muted-foreground))]"
                  style={{ fontFamily: typography.bodyFont ?? "Inter", fontWeight: typography.bodyWeight ?? 400 }}
                >
                  Subheadline and body paragraph preview. Your font pairing updates instantly.
                </div>
                <div className="mt-4">
                  <Button>CTA Button</Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="assets" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] sm:text-base">
              Assets
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Upload and manage logos and other supporting visuals for this brand.
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Upload PNG, JPG, WebP, SVG (up to 10MB).
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    for (const f of files) await uploadAsset(f, "other");
                    e.target.value = "";
                  }}
                />
                <Button variant="secondary">Upload assets</Button>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {(brand.assets ?? []).map((a: any) => (
                <div
                  key={a.id}
                  className="group relative overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.fileUrl} alt={a.fileName} className="h-28 w-full object-cover" />
                  <div className="p-2">
                    <div className="truncate text-xs font-medium">{a.fileName}</div>
                    <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      {a.category}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-full bg-[hsl(var(--background))] px-2 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        onClick={() => setLogo("logoPrimaryUrl", a.fileUrl)}
                      >
                        Primary logo
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-[hsl(var(--background))] px-2 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        onClick={() => setLogo("logoIconUrl", a.fileUrl)}
                      >
                        Icon logo
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-[hsl(var(--background))] px-2 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        onClick={() => setLogo("logoDarkUrl", a.fileUrl)}
                      >
                        Dark logo
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAssetToDelete(a.id)}
                    className="absolute right-2 top-2 hidden rounded bg-[hsl(var(--destructive))] px-2 py-1 text-xs text-white group-hover:block"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="settings" className="space-y-4">
          <h2 className="text-xl font-semibold">Settings</h2>
          <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Default brand</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  This brand will be used as the default context for new designs.
                </div>
              </div>
              <Button variant="secondary" onClick={setDefault} disabled={brand.isDefault}>
                Set as Default
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Duplicate brand</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Creates a copy of settings. Assets are shared by URL.
                </div>
              </div>
              <Button variant="secondary" onClick={duplicate}>
                Duplicate
              </Button>
            </div>

            <div className="rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 p-4">
              <div className="text-sm font-semibold text-[hsl(var(--destructive))]">Danger zone</div>
              <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Deleting a brand does not delete designs created with it.
              </div>
              <div className="mt-3">
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDeleteBrandInput("");
                    setShowDeleteBrand(true);
                  }}
                >
                  Delete Brand Profile
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Delete asset dialog */}
      <Dialog open={assetToDelete !== null} onOpenChange={() => setAssetToDelete(null)}>
        <DialogContent className="max-w-sm">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Delete asset
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              This will permanently remove the asset from this brand profile. This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAssetToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!assetToDelete) return;
                  await deleteAsset(assetToDelete);
                  setAssetToDelete(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete brand dialog */}
      <Dialog open={showDeleteBrand} onOpenChange={setShowDeleteBrand}>
        <DialogContent className="max-w-sm">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Delete brand “{brand.name}”
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              This action cannot be undone. Please type the brand name{" "}
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {brand.name}
              </span>{" "}
              to confirm.
            </p>
            <Input
              value={deleteBrandInput}
              onChange={(e) => setDeleteBrandInput(e.target.value)}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteBrand(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await deleteBrand();
                  setShowDeleteBrand(false);
                }}
                disabled={deleteBrandInput !== brand.name}
              >
                Delete brand
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

