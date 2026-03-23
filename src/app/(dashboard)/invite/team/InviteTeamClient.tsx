"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function InviteTeamClient({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    const t = token.trim();
    if (t.length < 16) {
      setError("Paste a valid invite token from your email or link.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invite/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Could not join team");
      const teamId = json.data?.teamId as string | undefined;
      if (teamId) {
        router.push(`/teams`);
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">Join a team</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Paste the token from your invite link (the part after <code className="font-mono">token=</code>) or open the
          full invite URL in this browser while signed in.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Invite token</label>
        <textarea
          className="min-h-[100px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-xs"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="hex token from invite…"
        />
      </div>
      {error ? <p className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={loading} onClick={() => void accept()}>
          {loading ? "Joining…" : "Accept invite"}
        </Button>
        <Link
          href="/teams"
          className="inline-flex h-9 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-transparent px-4 text-sm font-medium"
        >
          Back to teams
        </Link>
      </div>
    </div>
  );
}
