"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InstRow = { id: string; isActive: boolean; template: { id: string; name: string; platform: string; category: string; previewUrl: string | null } };
type Contrib = { id: string; name: string; platform: string; format: string; submissionStatus: string; updatedAt: string; installCount?: number };

export function MyLibraryClient() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<"installed" | "contributions">(
    tabFromUrl === "contributions" ? "contributions" : "installed"
  );
  const [installed, setInstalled] = useState<InstRow[]>([]);
  const [contributions, setContributions] = useState<Contrib[]>([]);

  const load = async () => {
    const [libRes, conRes] = await Promise.all([
      fetch("/api/templates/my-library?activeOnly=false"),
      fetch("/api/templates/my-contributions"),
    ]);
    const [libJson, conJson] = await Promise.all([libRes.json(), conRes.json()]);
    if (libJson.success) setInstalled(libJson.data.installations ?? []);
    if (conJson.success) setContributions(conJson.data.templates ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (searchParams.get("tab") === "contributions") setTab("contributions");
  }, [searchParams]);

  const toggle = async (installationId: string, templateId: string, next: boolean) => {
    await fetch(`/api/templates/installations/${installationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    }).catch(() => {});
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">My template library</h1>
        <Link href="/templates/contribute" className={cn(buttonVariants())}>
          Contribute a new template
        </Link>
      </div>

      <div className="flex gap-2 border-b border-[hsl(var(--border))]">
        <button
          type="button"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "installed" ? "border-[hsl(var(--accent))] text-[hsl(var(--foreground))]" : "border-transparent text-[hsl(var(--muted-foreground))]"
          }`}
          onClick={() => setTab("installed")}
        >
          Installed
        </button>
        <button
          type="button"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "contributions" ? "border-[hsl(var(--accent))] text-[hsl(var(--foreground))]" : "border-transparent text-[hsl(var(--muted-foreground))]"
          }`}
          onClick={() => setTab("contributions")}
        >
          My contributions
        </button>
      </div>

      {tab === "installed" ? (
        installed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
            You haven&apos;t installed any templates yet.{" "}
            <Link href="/templates" className="font-semibold text-[hsl(var(--accent))]">
              Browse the marketplace
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {installed.map((row) => (
              <div
                key={row.id}
                className="flex gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3"
              >
                <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-md bg-[hsl(var(--background))]">
                  {row.template.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.template.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-semibold">{row.template.name}</div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    {row.template.platform} · {row.template.category}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void toggle(row.id, row.template.id, !row.isActive)}>
                      {row.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Link
                      href={`/templates/${row.template.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {contributions.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {t.platform} / {t.format} · {t.submissionStatus}
                </div>
              </div>
              <div className="flex gap-2">
                {t.submissionStatus === "draft" ? (
                  <Link
                    href={`/templates/contribute?resume=${t.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Continue
                  </Link>
                ) : null}
                {t.submissionStatus === "approved" ? (
                  <Link
                    href={`/templates/${t.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    View on marketplace
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
