"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Plug, Trash2 } from "lucide-react";

const FIGMA_COMMUNITY_URL =
  process.env.NEXT_PUBLIC_FIGMA_COMMUNITY_PLUGIN_URL ?? "https://www.figma.com/community/plugin";

export default function IntegrationsPageClient() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tokens, setTokens] = useState<
    { id: string; name: string; lastUsedAt: string | null; expiresAt: string; createdAt: string }[]
  >([]);
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plugin/token/status");
      const json = await res.json();
      if (res.ok && json.success) {
        setConnected(!!json.data?.connected);
        setTokens(json.data?.tokens ?? []);
      } else if (!res.ok) {
        console.warn("Integrations: could not load token status", json?.error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generateToken = async () => {
    setGenerating(true);
    setNewToken(null);
    try {
      const res = await fetch("/api/plugin/token/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed");
      setNewToken(json.data.token as string);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to generate token");
    } finally {
      setGenerating(false);
    }
  };

  const revokeAll = async () => {
    if (!confirm("Disconnect the Figma plugin? All plugin tokens will be deleted.")) return;
    setRevoking(true);
    try {
      const res = await fetch("/api/plugin/token/revoke", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed");
      setNewToken(null);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to revoke");
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Connect external tools to DesignForge AI.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--accent-muted))]">
            <Plug className="h-5 w-5 text-[hsl(var(--accent))]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">DesignForge AI for Figma</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Push generated HTML/Tailwind designs to Figma as native layers.
            </div>
          </div>
        </div>

        {connected ? (
          <div className="space-y-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
            <div className="text-sm font-medium text-emerald-500">Plugin connected</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))] space-y-1">
              {tokens[0] ? (
                <>
                  <div>
                    Token: <span className="text-[hsl(var(--foreground))]">{tokens[0].name}</span>
                  </div>
                  <div>
                    Last used:{" "}
                    {tokens[0].lastUsedAt ? new Date(tokens[0].lastUsedAt).toLocaleString() : "—"}
                  </div>
                  <div>Expires: {new Date(tokens[0].expiresAt).toLocaleDateString()}</div>
                </>
              ) : null}
            </div>
            <Button variant="destructive" size="sm" onClick={() => void revokeAll()} disabled={revoking}>
              <Trash2 className="mr-2 h-4 w-4" />
              {revoking ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">Step 1 — Install</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={FIGMA_COMMUNITY_URL} target="_blank" rel="noreferrer">
                  <Button type="button" variant="secondary" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Get plugin on Figma Community
                  </Button>
                </a>
                <span className="text-xs text-[hsl(var(--muted-foreground))] self-center">
                  Or load from manifest: <code className="rounded bg-[hsl(var(--surface-elevated))] px-1">plugins/figma/manifest.json</code>
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">Step 2 — Generate token</div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Tokens are shown only once. Store them in the plugin only.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void generateToken()} disabled={generating}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Generate token
                </Button>
              </div>
              {newToken ? (
                <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Copy this token now — it cannot be shown again.
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded bg-[hsl(var(--background))] p-2 text-xs">{newToken}</pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => void navigator.clipboard.writeText(newToken)}
                  >
                    Copy token
                  </Button>
                </div>
              ) : null}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">Step 3 — Connect in Figma</div>
              <ol className="mt-2 list-decimal pl-5 text-xs text-[hsl(var(--muted-foreground))] space-y-1">
                <li>Open the DesignForge plugin in Figma Desktop.</li>
                <li>Click <strong className="text-[hsl(var(--foreground))]">Connect</strong>.</li>
                <li>Paste your token and confirm.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      <Link href="/settings" className="text-sm text-[hsl(var(--accent))] hover:underline">
        ← Back to settings
      </Link>
    </div>
  );
}
