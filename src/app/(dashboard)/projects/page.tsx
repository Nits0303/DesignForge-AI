"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    const res = await fetch("/api/projects");
    const json = await res.json();
    if (res.ok && json.success) setProjects(json.data ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button onClick={() => setShowCreate(true)}>Create Project</Button>
      </div>

      {showCreate ? (
        <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="h-10 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await fetch("/api/projects", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, description }),
                });
                if (res.ok) {
                  setName("");
                  setDescription("");
                  setShowCreate(false);
                  await load();
                }
              }}
              disabled={!name.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <Link href={`/projects/${p.id}`} className="text-base font-semibold hover:text-[hsl(var(--accent))]">
                {p.name}
              </Link>
              <button
                type="button"
                className="text-xs text-[hsl(var(--destructive))]"
                onClick={async () => {
                  const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
                  if (res.status === 204) await load();
                }}
              >
                Delete
              </button>
            </div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {p.designs?.length ?? 0} designs
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(p.designs ?? []).slice(0, 4).map((d: any) => (
                <div
                  key={d.id}
                  className="h-16 rounded bg-[hsl(var(--background))] text-[10px] text-[hsl(var(--muted-foreground))] flex items-center justify-center"
                >
                  {d.platform}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

