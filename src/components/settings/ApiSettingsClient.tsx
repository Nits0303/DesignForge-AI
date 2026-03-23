"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { API_KEY_PERMISSION_LABELS, ALL_API_KEY_PERMISSIONS } from "@/constants/apiKeyPermissions";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: unknown;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  rateLimitTier: string;
  webhookUrl: string | null;
  createdAt: string;
};

type UsageDay = { date: string; requests: number; errors: number };

export function ApiSettingsClient() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [usageSeries, setUsageSeries] = useState<UsageDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const p of ALL_API_KEY_PERMISSIONS) o[p] = false;
    return o;
  });
  const [rawKeyModal, setRawKeyModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [keysRes, usageRes] = await Promise.all([
      fetch("/api/settings/api-keys"),
      fetch("/api/settings/api-keys/usage"),
    ]);
    const keysJson = await keysRes.json();
    const usageJson = await usageRes.json();
    if (keysJson.success) setKeys(keysJson.data.keys ?? []);
    if (usageJson.success) setUsageSeries(usageJson.data.series ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createKey = async () => {
    if (name.trim().length < 3) {
      alert("Name must be at least 3 characters.");
      return;
    }
    const selected = ALL_API_KEY_PERMISSIONS.filter((p) => perms[p]);
    if (!selected.length) {
      alert("Select at least one permission.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), permissions: selected }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed");
      setRawKeyModal(json.data.rawKey as string);
      setCreateOpen(false);
      setName("");
      for (const p of ALL_API_KEY_PERMISSIONS) setPerms((prev) => ({ ...prev, [p]: false }));
      void load();
    } catch (e: any) {
      alert(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? Applications using it will lose access immediately.")) return;
    await fetch(`/api/settings/api-keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    void load();
  };

  if (loading) {
    return <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading API keys…</div>;
  }

  const maxReq = Math.max(1, ...usageSeries.map((d) => d.requests));

  return (
    <div className="space-y-6">
      {usageSeries.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">API usage (30 days)</div>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Daily request volume across all keys. Bars use a warm tint when any call returned HTTP ≥400.
          </p>
          <div className="mt-4 flex h-28 items-end gap-px overflow-x-auto pb-1">
            {usageSeries.map((d) => {
              const h = Math.max(4, (d.requests / maxReq) * 100);
              const hasErr = d.errors > 0;
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.requests} requests, ${d.errors} errors`}
                  className="flex min-w-[6px] flex-1 flex-col justify-end"
                >
                  <div
                    className={`w-full rounded-t-sm ${hasErr ? "bg-[hsl(var(--warning))]/70" : "bg-[hsl(var(--accent))]/75"}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">Developer API</h1>
          <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Use API keys to integrate DesignForge AI with your own applications, automations, or workflows. Keep your keys
            secret — they grant access to your account within the scopes you select.
          </p>
          <Link href="/docs/api" className="mt-2 inline-block text-sm text-[hsl(var(--accent))]">
            API documentation →
          </Link>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create API key
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[hsl(var(--border))]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Prefix</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[hsl(var(--muted-foreground))]">
                  No API keys yet.
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} className="border-b border-[hsl(var(--border))]">
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.keyPrefix}…</td>
                  <td className="px-3 py-2">{k.status}</td>
                  <td className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-3 py-2 text-xs">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    {k.status === "active" ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => void revoke(k.id)}>
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] space-y-3 overflow-y-auto border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            Choose a display name and the permissions this key is allowed to use.
          </DialogDescription>
          <div className="space-y-2">
            <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Name</label>
            <input
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production integration"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Permissions</div>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {ALL_API_KEY_PERMISSIONS.map((p) => (
                <label key={p} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!perms[p]}
                    onChange={(e) => setPerms((prev) => ({ ...prev, [p]: e.target.checked }))}
                  />
                  <span>
                    <span className="font-mono text-xs text-[hsl(var(--accent))]">{p}</span>
                    <span className="block text-[hsl(var(--muted-foreground))]">{API_KEY_PERMISSION_LABELS[p]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void createKey()}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rawKeyModal} onOpenChange={() => setRawKeyModal(null)}>
        <DialogContent className="space-y-3 border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          <DialogTitle className="text-base font-semibold text-[hsl(var(--warning))]">
            Copy now — this key cannot be shown again
          </DialogTitle>
          <DialogDescription>
            Store this secret somewhere safe. You will not be able to view it again after closing this dialog.
          </DialogDescription>
          <pre className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs break-all">
            {rawKeyModal}
          </pre>
          <Button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(rawKeyModal ?? "");
            }}
          >
            Copy to clipboard
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
