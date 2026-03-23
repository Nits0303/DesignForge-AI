"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Config = {
  id: string;
  isEnabled: boolean;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  hidePoweredBy: boolean;
};

export function WhiteLabelAdminClient() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/white-label");
      const json = await res.json();
      if (json.success && json.data?.config) setCfg(json.data.config);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/white-label", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled: cfg.isEnabled,
          appName: cfg.appName,
          logoUrl: cfg.logoUrl,
          faviconUrl: cfg.faviconUrl,
          primaryColor: cfg.primaryColor,
          supportEmail: cfg.supportEmail,
          privacyPolicyUrl: cfg.privacyPolicyUrl,
          termsUrl: cfg.termsUrl,
          hidePoweredBy: cfg.hidePoweredBy,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Save failed");
      setCfg(json.data.config);
      alert("Saved.");
    } catch (e: any) {
      alert(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !cfg) {
    return <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">White-label</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          When enabled, public pages use your app name, accent color, and favicon (see root layout). API:{" "}
          <code className="font-mono text-xs">GET /api/public/white-label</code>.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cfg.isEnabled} onChange={(e) => setCfg({ ...cfg, isEnabled: e.target.checked })} />
        Enable white-label
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">App name</label>
          <input
            className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            value={cfg.appName}
            onChange={(e) => setCfg({ ...cfg, appName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Primary color (#RRGGBB)</label>
          <input
            className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-sm"
            value={cfg.primaryColor ?? ""}
            onChange={(e) => setCfg({ ...cfg, primaryColor: e.target.value || null })}
            placeholder="#6366f1"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Logo URL</label>
          <input
            className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            value={cfg.logoUrl ?? ""}
            onChange={(e) => setCfg({ ...cfg, logoUrl: e.target.value || null })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Favicon URL</label>
          <input
            className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            value={cfg.faviconUrl ?? ""}
            onChange={(e) => setCfg({ ...cfg, faviconUrl: e.target.value || null })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cfg.hidePoweredBy}
          onChange={(e) => setCfg({ ...cfg, hidePoweredBy: e.target.checked })}
        />
        Hide “Powered by” footer where applicable
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setPreview(!preview)}>
          {preview ? "Hide" : "Show"} live preview
        </Button>
      </div>

      {preview && cfg.primaryColor ? (
        <div
          className="rounded-xl border border-[hsl(var(--border))] p-6"
          style={
            {
              ["--accent" as string]: cfg.primaryColor,
              ["--ring" as string]: cfg.primaryColor,
            } as CSSProperties
          }
        >
          <div className="text-lg font-semibold" style={{ color: cfg.primaryColor }}>
            {cfg.appName}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Preview uses your primary color as accent.</p>
          {cfg.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cfg.logoUrl} alt="" className="mt-4 h-10 object-contain" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
