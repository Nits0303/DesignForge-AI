"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["hero", "feature_grid", "social_post", "dashboard_widget", "mobile_screen", "landing"];
const PLATFORMS = ["instagram", "linkedin", "facebook", "twitter", "website", "mobile", "dashboard", "all"];

export function ContributePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<"design" | "manual">("design");
  const [designs, setDesigns] = useState<{ id: string; title: string; currentVersion: number; status: string }[]>([]);
  const [designSearch, setDesignSearch] = useState("");
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [htmlSnippet, setHtmlSnippet] = useState("");
  const [name, setName] = useState("");
  const [marketplaceDescription, setMarketplaceDescription] = useState("");
  const [category, setCategory] = useState("hero");
  const [platform, setPlatform] = useState("website");
  const [format, setFormat] = useState("all");
  const [tags, setTags] = useState("");
  const [licenseType, setLicenseType] = useState<"mit" | "cc_by" | "cc_by_nc">("mit");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState([false, false, false]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/designs?status=approved&limit=50");
      const json = await res.json();
      if (json.success) setDesigns(json.data.items ?? []);
    })();
  }, []);

  useEffect(() => {
    const resume = searchParams.get("resume");
    if (resume) setDraftId(resume);
  }, [searchParams]);

  useEffect(() => {
    if (!draftId) return;
    (async () => {
      const res = await fetch("/api/templates/my-contributions");
      const json = await res.json();
      const tpl = (json.data?.templates ?? []).find((t: { id: string }) => t.id === draftId);
      if (tpl) {
        setName(tpl.name);
        setHtmlSnippet(tpl.htmlSnippet || "");
        setMarketplaceDescription(tpl.marketplaceDescription || "");
        setCategory(tpl.category);
        setPlatform(tpl.platform);
        setFormat(tpl.format || "all");
        setTags((tpl.tags || []).join(", "));
        setLicenseType(tpl.licenseType || "mit");
        setSubmissionNotes(tpl.submissionNotes || "");
      }
    })();
  }, [draftId]);

  const saveDraft = async () => {
    if (!name || name.length < 5) return;
    setSaving(true);
    try {
      const body = {
        id: draftId ?? undefined,
        name,
        htmlSnippet: htmlSnippet || "<html><body></body></html>",
        marketplaceDescription: marketplaceDescription || null,
        category,
        platform,
        format,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
        licenseType,
        submissionNotes: submissionNotes || null,
        submissionStatus: "draft",
      };
      const res = await fetch("/api/templates/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success && json.data?.template?.id) setDraftId(json.data.template.id);
    } finally {
      setSaving(false);
    }
  };

  const loadDesignHtml = async () => {
    if (!selectedDesignId) return;
    const d = designs.find((x) => x.id === selectedDesignId);
    if (!d) return;
    const res = await fetch(`/api/design/${selectedDesignId}/version/${d.currentVersion}`);
    const json = await res.json();
    if (json.success && json.data?.htmlContent) {
      setHtmlSnippet(String(json.data.htmlContent));
    }
  };

  const submit = async () => {
    if (!checklist.every(Boolean)) return;
    const res = await fetch("/api/templates/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draftId ?? undefined,
        name,
        htmlSnippet,
        marketplaceDescription: marketplaceDescription || null,
        category,
        platform,
        format,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
        licenseType,
        submissionNotes: submissionNotes || null,
        submissionStatus: "submitted",
      }),
    });
    const json = await res.json();
    if (json.success) {
      router.push("/templates/contribute/success");
    }
  };

  const filteredDesigns = designs.filter((d) =>
    d.title.toLowerCase().includes(designSearch.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Contribute a Template</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Share your designs with the DesignForge community.
        </p>
        <Link href="/templates/guidelines" className="mt-2 inline-block text-sm font-medium text-[hsl(var(--accent))]">
          Read contribution guidelines →
        </Link>
        <Button type="button" variant="outline" size="sm" className="ml-3" disabled={saving} onClick={() => void saveDraft()}>
          {saving ? "Saving…" : "Save draft"}
        </Button>
      </div>

      <div className="flex gap-2 text-xs">
        {[1, 2, 3, 4].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`rounded-full px-3 py-1 ${step === s ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--accent))]" : "bg-[hsl(var(--surface-elevated))]"}`}
          >
            Step {s}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSource("design")}
              className={`rounded-xl border p-4 text-left ${source === "design" ? "border-[hsl(var(--accent))]" : "border-[hsl(var(--border))]"}`}
            >
              <div className="font-semibold">From my designs</div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Use HTML from an approved design.</p>
            </button>
            <button
              type="button"
              onClick={() => setSource("manual")}
              className={`rounded-xl border p-4 text-left ${source === "manual" ? "border-[hsl(var(--accent))]" : "border-[hsl(var(--border))]"}`}
            >
              <div className="font-semibold">Write HTML manually</div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Paste a full Tailwind HTML document.</p>
            </button>
          </div>
          {source === "design" ? (
            <div className="space-y-2">
              <input
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                placeholder="Search designs…"
                value={designSearch}
                onChange={(e) => setDesignSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-[hsl(var(--border))]">
                {filteredDesigns.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface-elevated))] ${
                      selectedDesignId === d.id ? "bg-[hsl(var(--accent-muted))]" : ""
                    }`}
                    onClick={() => setSelectedDesignId(d.id)}
                  >
                    {d.title}
                  </button>
                ))}
              </div>
              <Button type="button" size="sm" onClick={() => void loadDesignHtml()}>
                Load HTML into editor
              </Button>
            </div>
          ) : null}
          <textarea
            className="min-h-[240px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 font-mono text-xs text-[hsl(var(--foreground))]"
            value={htmlSnippet}
            onChange={(e) => setHtmlSnippet(e.target.value)}
            placeholder="Full HTML document…"
          />
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[hsl(var(--muted-foreground))]">Template name (5–80 chars)</label>
            <input
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--muted-foreground))]">Marketplace description (max 500)</label>
            <textarea
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              rows={4}
              maxLength={500}
              value={marketplaceDescription}
              onChange={(e) => setMarketplaceDescription(e.target.value)}
            />
            <div className="text-right text-[10px] text-[hsl(var(--muted-foreground))]">
              {marketplaceDescription.length}/500
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs">Category</label>
              <select
                className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs">Platform</label>
              <select
                className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs">Format</label>
            <input
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs">Tags (comma-separated, max 10)</label>
            <input
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div>
            <div className="text-xs font-medium">License</div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="radio" checked={licenseType === "mit"} onChange={() => setLicenseType("mit")} />
              MIT (recommended)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={licenseType === "cc_by"} onChange={() => setLicenseType("cc_by")} />
              CC BY
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={licenseType === "cc_by_nc"} onChange={() => setLicenseType("cc_by_nc")} />
              CC BY-NC
            </label>
          </div>
          <div>
            <label className="text-xs">Submission notes for reviewers</label>
            <textarea
              className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              rows={3}
              value={submissionNotes}
              onChange={(e) => setSubmissionNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Preview uses your HTML in a sandboxed iframe. Upload preview images via your usual asset flow and paste URLs
            here in a future iteration — for now continue to the review step.
          </p>
          <div className="h-64 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            {htmlSnippet ? <iframe title="preview" srcDoc={htmlSnippet} className="h-full w-full border-0" /> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>Next</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[hsl(var(--border))] p-4 text-sm">
            <div className="font-semibold">{name}</div>
            <p className="mt-2 text-[hsl(var(--muted-foreground))]">{marketplaceDescription}</p>
          </div>
          {[0, 1, 2].map((i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={checklist[i]}
                onChange={(e) => {
                  const next = [...checklist];
                  next[i] = e.target.checked;
                  setChecklist(next);
                }}
              />
              <span>
                {i === 0 && "I have removed all personal or client brand data from this template."}
                {i === 1 && "I have the right to share this template under the selected license."}
                {i === 2 && "I understand that the DesignForge team will review this before publishing."}
              </span>
            </label>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button onClick={() => void submit()} disabled={!checklist.every(Boolean)}>
              Submit for review
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
