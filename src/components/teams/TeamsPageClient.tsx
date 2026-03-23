"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: string;
  role: string;
  memberCount: number;
};

export function TeamsPageClient() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = async () => {
    const res = await fetch("/api/teams");
    const json = await res.json();
    if (json.success) setTeams(json.data.teams ?? []);
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  const createTeam = async () => {
    const name = newName.trim();
    if (name.length < 2) {
      alert("Enter a team name (at least 2 characters).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Could not create team");
      setNewName("");
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading teams…</div>;
  }

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-8">
          <p className="text-[hsl(var(--muted-foreground))]">
            You&apos;re not part of any team yet. Create one to collaborate with colleagues.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Team name</label>
              <input
                className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Acme Marketing"
              />
            </div>
            <Button
              type="button"
              className="text-white hover:text-white"
              disabled={creating}
              onClick={() => void createTeam()}
            >
              {creating ? "Creating…" : "Create team"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
            Invitations and advanced workspace tools will expand in future Sprint 18 slices.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">New team</label>
          <input
            className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name"
          />
        </div>
        <Button type="button" variant="outline" disabled={creating} onClick={() => void createTeam()}>
          {creating ? "Creating…" : "Create team"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
      {teams.map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4"
        >
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-lg bg-[hsl(var(--border))]">
              {t.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[hsl(var(--foreground))]">{t.name}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {t.role} · {t.memberCount} members
              </div>
            </div>
          </div>
          <Link
            href={`/teams/${t.slug}`}
            className="mt-4 inline-block text-sm font-medium text-[hsl(var(--accent))]"
          >
            Open team workspace →
          </Link>
        </div>
      ))}
      </div>
    </div>
  );
}
