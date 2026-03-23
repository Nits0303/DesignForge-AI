"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function CollectionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<{ collection: { name: string; description: string }; templates: any[] } | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/templates/collections/${id}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    })();
  }, [id]);

  const installAll = async () => {
    await fetch(`/api/templates/collections/${id}/install-all`, { method: "POST" });
  };

  if (!data) return <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-6">
        <h1 className="text-2xl font-bold">{data.collection.name}</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{data.collection.description}</p>
        <Button className="mt-4" onClick={() => void installAll()}>
          Install all
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.templates.map((t: any) => (
          <Link
            key={t.id}
            href={`/templates/${t.id}`}
            className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
          >
            <div className="aspect-video bg-[hsl(var(--background))]">
              {t.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="p-3 text-sm font-medium">{t.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
