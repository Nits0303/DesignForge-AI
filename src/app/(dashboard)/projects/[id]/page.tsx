"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DesignCard } from "@/components/design/DesignCard";

export default function ProjectDetailsPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<any | null>(null);
  const [designs, setDesigns] = useState<any[]>([]);

  useEffect(() => {
    if (!params?.id) return;
    (async () => {
      const projectsRes = await fetch("/api/projects");
      const projectsJson = await projectsRes.json();
      if (projectsRes.ok && projectsJson.success) {
        const p = (projectsJson.data ?? []).find((x: any) => x.id === params.id) ?? null;
        setProject(p);
      }
      const designsRes = await fetch(`/api/designs?projectId=${params.id}&limit=50`);
      const designsJson = await designsRes.json();
      if (designsRes.ok && designsJson.success) {
        setDesigns(designsJson.data.items ?? []);
      }
    })();
  }, [params?.id]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project?.name ?? "Project"}</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{project?.description ?? ""}</p>
        </div>
        {params?.id ? (
          <Link
            href={`/workspace?projectId=${params.id}`}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[hsl(var(--accent))] px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-[hsl(var(--accent-hover))] hover:!text-white visited:!text-white focus-visible:!text-white"
          >
            Create design in this project
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {designs.map((d) => (
          <DesignCard key={d.id} design={d} />
        ))}
      </div>
    </div>
  );
}

