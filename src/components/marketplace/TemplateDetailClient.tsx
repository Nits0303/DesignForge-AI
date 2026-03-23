"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, Flag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useUIStore } from "@/store/useUIStore";

type Detail = {
  id: string;
  name: string;
  source?: string | null;
  marketplaceDescription: string | null;
  platform: string;
  category: string;
  format: string;
  tags: string[];
  templateVersion: string;
  licenseType: string;
  previewUrl: string | null;
  previewImages: unknown;
  installCount: number;
  usageCount: number;
  avgMarketplaceRating: number | null;
  marketplaceRatingCount: number;
  ratingDistribution: Record<string, number>;
  htmlSnippet: string;
  isInstalledByCurrentUser?: boolean;
  contributor: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: string;
    contributorTrusted: boolean;
  } | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  reviewText: string | null;
  createdAt: string;
  usedInDesign: boolean;
  reviewer: { id: string; name: string | null; avatarUrl: string | null };
};

export function TemplateDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const enqueueToast = useUIStore((s) => s.enqueueToast);
  const [data, setData] = useState<Detail | null>(null);
  const [live, setLive] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("other");
  const [reportDesc, setReportDesc] = useState("");
  const [installing, setInstalling] = useState(false);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewSort, setReviewSort] = useState<"rating" | "recent">("rating");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/templates/marketplace/${id}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/templates/marketplace/${id}/reviews?sort=${reviewSort}&limit=12`);
      const json = await res.json();
      if (json.success) setReviews(json.data.items ?? []);
    })();
  }, [id, reviewSort]);

  const previewUrls = () => {
    if (!data) return [];
    const extra = data.previewImages as string[] | null;
    const list: string[] = [];
    if (data.previewUrl) list.push(data.previewUrl);
    if (extra && Array.isArray(extra)) list.push(...extra.filter(Boolean));
    return [...new Set(list)];
  };

  const [mainIdx, setMainIdx] = useState(0);

  const install = async () => {
    setInstalling(true);
    try {
      const res = await fetch(`/api/templates/${id}/install`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: { code?: string; message?: string };
      };
      if (json.success) {
        setData((d) => (d ? { ...d, isInstalledByCurrentUser: true } : d));
        enqueueToast({
          title: "Installed",
          description: "Template added to your library. Open Workspace → templates to use it.",
          type: "success",
        });
        router.refresh();
        return;
      }
      if (res.status === 409 || json.error?.code === "CONFLICT") {
        setData((d) => (d ? { ...d, isInstalledByCurrentUser: true } : d));
        enqueueToast({
          title: "Already installed",
          description: "This template is already in your library.",
          type: "info",
        });
        return;
      }
      if (res.status === 401) {
        enqueueToast({
          title: "Sign in required",
          description: "Log in to install templates.",
          type: "error",
        });
        return;
      }
      if (res.status === 403) {
        enqueueToast({
          title: "Unavailable",
          description: json.error?.message ?? "This template cannot be installed right now.",
          type: "error",
        });
        return;
      }
      enqueueToast({
        title: "Could not install",
        description: json.error?.message ?? `Request failed (${res.status}).`,
        type: "error",
      });
    } catch {
      enqueueToast({
        title: "Network error",
        description: "Check your connection and try again.",
        type: "error",
      });
    } finally {
      setInstalling(false);
    }
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    await navigator.clipboard.writeText(url);
  };

  const submitReport = async () => {
    const res = await fetch(`/api/templates/${id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportType, description: reportDesc }),
    });
    if (res.ok) {
      setReportOpen(false);
      setReportDesc("");
    }
  };

  if (!data) {
    return <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>;
  }

  const urls = previewUrls();
  const mainUrl = urls[mainIdx] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
    <div className="grid gap-8 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        {!live && mainUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mainUrl} alt="" className="w-full rounded-2xl border border-[hsl(var(--border))] object-cover" />
        ) : (
          <div className="h-[420px] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <iframe title="preview" srcDoc={data.htmlSnippet} className="h-full w-full border-0" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={live ? "default" : "outline"} onClick={() => setLive(!live)}>
            {live ? "Static preview" : "Live preview"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push(`/workspace`)}>
            Test in workspace
          </Button>
        </div>
        {urls.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto">
            {urls.map((u, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMainIdx(i)}
                className={`h-16 w-24 flex-shrink-0 overflow-hidden rounded-md border ${
                  i === mainIdx ? "border-[hsl(var(--accent))]" : "border-[hsl(var(--border))]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{data.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[hsl(var(--surface-elevated))] px-2 py-0.5">{data.platform}</span>
            <span className="rounded-full bg-[hsl(var(--surface-elevated))] px-2 py-0.5">{data.category}</span>
            <span className="rounded-full bg-[hsl(var(--surface-elevated))] px-2 py-0.5">v{data.templateVersion}</span>
          </div>
        </div>

        {data.contributor ? (
          <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-[hsl(var(--border))]">
              {data.contributor.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.contributor.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                {data.contributor.name ?? "Contributor"}
                {data.contributor.contributorTrusted ? (
                  <span className="ml-2 text-[10px] text-[hsl(var(--accent))]">Trusted</span>
                ) : null}
              </div>
              <Link href={`/templates?contributor=community`} className="text-xs text-[hsl(var(--accent))]">
                View community templates
              </Link>
            </div>
          </div>
        ) : data.source === "community_legacy" ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Former contributor</div>
        ) : (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">DesignForge AI</div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Star className="h-4 w-4 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />
          <span>{data.avgMarketplaceRating != null ? data.avgMarketplaceRating.toFixed(1) : "—"}</span>
          <span className="text-[hsl(var(--muted-foreground))]">({data.marketplaceRatingCount} ratings)</span>
        </div>

        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          <div>{data.installCount} installs</div>
          <div>{data.usageCount} uses in designs</div>
        </div>

        {data.marketplaceDescription ? (
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{data.marketplaceDescription}</p>
        ) : null}

        <div className="sticky top-4 space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
          {data.isInstalledByCurrentUser ? (
            <Button className="w-full" disabled>
              Installed ✓
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full text-white hover:text-white"
              onClick={() => void install()}
              disabled={installing}
            >
              <Download className="mr-2 h-4 w-4" />
              {installing ? "Installing…" : "Install template"}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={() => void share()}>
            <Copy className="mr-2 h-4 w-4" />
            Share link
          </Button>
          <button
            type="button"
            className="text-xs text-[hsl(var(--muted-foreground))] underline"
            onClick={() => setReportOpen(true)}
          >
            <Flag className="mr-1 inline h-3 w-3" />
            Report
          </button>
        </div>
      </div>
    </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Report template</h3>
          <select
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            <option value="inappropriate_content">Inappropriate content</option>
            <option value="copyright_violation">Copyright</option>
            <option value="broken_template">Broken template</option>
            <option value="spam">Spam</option>
            <option value="other">Other</option>
          </select>
          <Textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} placeholder="Describe the issue" />
          <Button onClick={() => void submitReport()}>Submit report</Button>
        </DialogContent>
      </Dialog>

      <section className="border-t border-[hsl(var(--border))] pt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Reviews</h2>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className={reviewSort === "rating" ? "font-semibold text-[hsl(var(--accent))]" : "text-[hsl(var(--muted-foreground))]"}
              onClick={() => setReviewSort("rating")}
            >
              Highest rated
            </button>
            <button
              type="button"
              className={reviewSort === "recent" ? "font-semibold text-[hsl(var(--accent))]" : "text-[hsl(var(--muted-foreground))]"}
              onClick={() => setReviewSort("recent")}
            >
              Most recent
            </button>
          </div>
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No reviews yet.</p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-[hsl(var(--foreground))]">{r.reviewer.name ?? "User"}</span>
                  <span className="text-[hsl(var(--warning))]">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  {r.usedInDesign ? (
                    <span className="rounded-full bg-[hsl(var(--background))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                      Used in a design
                    </span>
                  ) : null}
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.reviewText ? <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{r.reviewText}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
