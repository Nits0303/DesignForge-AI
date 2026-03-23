"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const EVENTS = [
  "test.started",
  "test.result_updated",
  "test.winner_detected",
  "test.completed",
  "test.promoted",
] as const;

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
};

type DeliveryRow = {
  id: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  createdAt: string;
};

function eventSelectionFromWebhook(w: WebhookRow): Record<string, boolean> {
  const arr = Array.isArray(w.events) ? w.events : [];
  return Object.fromEntries(EVENTS.map((e) => [e, arr.includes(e)])) as Record<string, boolean>;
}

export function WebhooksSettingsClient() {
  const [items, setItems] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>(
    () => Object.fromEntries(EVENTS.map((e) => [e, true])) as Record<string, boolean>
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveryCache, setDeliveryCache] = useState<Record<string, DeliveryRow[]>>({});
  const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editSecret, setEditSecret] = useState("");
  const [editEvents, setEditEvents] = useState<Record<string, boolean>>(
    () => Object.fromEntries(EVENTS.map((e) => [e, true])) as Record<string, boolean>
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/webhooks");
      const json = await res.json();
      if (!res.ok || !json?.success) {
        if (res.status === 403) throw new Error("Admin only");
        throw new Error(json?.error?.message ?? "Failed to load");
      }
      const list = (json.data?.webhooks ?? []) as WebhookRow[];
      setItems(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchDeliveries = async (id: string) => {
    if (deliveryCache[id]) return;
    setLoadingDeliveries(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/webhooks/${id}/deliveries`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Failed to load deliveries");
      const list = (json.data?.deliveries ?? []) as DeliveryRow[];
      setDeliveryCache((c) => ({ ...c, [id]: list }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingDeliveries(null);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    void fetchDeliveries(id);
  };

  const startEdit = (w: WebhookRow) => {
    setEditId(w.id);
    setEditUrl(w.url);
    setEditSecret("");
    setEditEvents(eventSelectionFromWebhook(w));
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setError(null);
    try {
      const ev = EVENTS.filter((e) => editEvents[e]);
      if (!ev.length) throw new Error("Select at least one event");
      const res = await fetch(`/api/admin/webhooks/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: editUrl.trim(),
          events: ev,
          ...(editSecret.trim() ? { secret: editSecret.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Update failed");
      setEditId(null);
      setDeliveryCache({});
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const create = async () => {
    setError(null);
    try {
      const events = EVENTS.filter((e) => selected[e]);
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          ...(secret.trim() ? { secret: secret.trim() } : {}),
          events,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Create failed");
      setUrl("");
      setSecret("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  };

  const toggle = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/admin/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      setError(json?.error?.message ?? "Update failed");
      return;
    }
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    const res = await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      setError(json?.error?.message ?? "Delete failed");
      return;
    }
    setExpandedId(null);
    setDeliveryCache((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">Webhooks</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          HTTPS endpoints that receive signed JSON events for A/B tests (admin only). Delivery attempts are logged for
          debugging.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
        </div>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">Add webhook</div>
        <label className="block space-y-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">URL (HTTPS)</span>
          <input
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/hooks/designforge"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Secret (optional if WEBHOOK_SIGNING_SECRET is set)
          </span>
          <input
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </label>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="sr-only">Event types</legend>
          {EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected[e]}
                onChange={(ev) => setSelected((s) => ({ ...s, [e]: ev.target.checked }))}
              />
              <code className="text-xs">{e}</code>
            </label>
          ))}
        </fieldset>
        <Button type="button" onClick={() => void create()} disabled={!url.trim().startsWith("https://")}>
          Save webhook
        </Button>
      </Card>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Configured webhooks</div>
        {loading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No webhooks yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((w) => (
              <li
                key={w.id}
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm"
              >
                {editId === w.id ? (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Edit webhook</div>
                    <label className="block space-y-1">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">URL</span>
                      <input
                        className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">New secret (optional)</span>
                      <input
                        type="password"
                        className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                        value={editSecret}
                        onChange={(e) => setEditSecret(e.target.value)}
                        placeholder="Leave blank to keep current"
                        autoComplete="new-password"
                      />
                    </label>
                    <fieldset className="flex flex-wrap gap-2">
                      <legend className="sr-only">Events</legend>
                      {EVENTS.map((e) => (
                        <label key={e} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={editEvents[e]}
                            onChange={(ev) => setEditEvents((s) => ({ ...s, [e]: ev.target.checked }))}
                          />
                          <code>{e}</code>
                        </label>
                      ))}
                    </fieldset>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void saveEdit()}>
                        Save changes
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="break-all font-mono text-xs">{w.url}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">
                          {(Array.isArray(w.events) ? w.events : []).join(", ")}
                        </div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">
                          {w.isActive ? "Active" : "Paused"} · {new Date(w.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(w)}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => void toggleExpand(w.id)}>
                          {expandedId === w.id ? "Hide log" : "Delivery log"}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => void toggle(w.id, w.isActive)}>
                          {w.isActive ? "Pause" : "Resume"}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => void remove(w.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    {expandedId === w.id ? (
                      <div className="mt-3 border-t border-[hsl(var(--border))] pt-3">
                        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                          Recent deliveries (newest first)
                        </div>
                        {loadingDeliveries === w.id ? (
                          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Loading…</p>
                        ) : (
                          <div className="mt-2 max-h-64 overflow-auto rounded border border-[hsl(var(--border))]">
                            <table className="min-w-full text-left text-xs">
                              <thead className="sticky top-0 bg-[hsl(var(--surface-elevated))]">
                                <tr>
                                  <th className="px-2 py-1">Time</th>
                                  <th className="px-2 py-1">Event</th>
                                  <th className="px-2 py-1">OK</th>
                                  <th className="px-2 py-1">HTTP</th>
                                  <th className="px-2 py-1">Error</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(deliveryCache[w.id] ?? []).map((d) => (
                                  <tr key={d.id} className="border-t border-[hsl(var(--border))]">
                                    <td className="px-2 py-1 whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</td>
                                    <td className="px-2 py-1">
                                      <code>{d.event}</code>
                                    </td>
                                    <td className="px-2 py-1">{d.success ? "yes" : "no"}</td>
                                    <td className="px-2 py-1">{d.statusCode ?? "—"}</td>
                                    <td className="max-w-[200px] truncate px-2 py-1 text-[hsl(var(--muted-foreground))]" title={d.errorMessage ?? ""}>
                                      {d.errorMessage ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(deliveryCache[w.id] ?? []).length === 0 && loadingDeliveries !== w.id ? (
                              <p className="p-2 text-xs text-[hsl(var(--muted-foreground))]">No delivery attempts yet.</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
