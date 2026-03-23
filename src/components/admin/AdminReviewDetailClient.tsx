"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AdminReviewDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [html, setHtml] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      await fetch(`/api/admin/templates/${id}/claim-review`, { method: "POST" });
      const res = await fetch(`/api/admin/templates/${id}`);
      const json = await res.json();
      if (json.success && json.data?.template) {
        const tpl = json.data.template as Record<string, unknown>;
        setHtml(String(tpl.htmlSnippet ?? ""));
        setName(String(tpl.name ?? ""));
        setMeta(tpl);
      }
    })();
  }, [id]);

  const decide = async (decision: "approved" | "request_changes" | "rejected") => {
    const res = await fetch(`/api/admin/templates/${id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewNotes: notes || null }),
    });
    if (res.ok) router.push("/admin/templates/review");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Preview</h2>
        <div className="h-[480px] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
          <iframe title="preview" srcDoc={html} className="h-full w-full border-0" />
        </div>
      </div>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">{name}</h1>
        {meta ? (
          <pre className="max-h-40 overflow-auto rounded-md bg-[hsl(var(--background))] p-2 text-[10px] text-[hsl(var(--muted-foreground))]">
            {JSON.stringify(
              {
                platform: meta.platform,
                category: meta.category,
                tags: meta.tags,
                submissionNotes: meta.submissionNotes,
              },
              null,
              2
            )}
          </pre>
        ) : null}
        <div>
          <div className="text-xs font-medium">HTML</div>
          <textarea
            className="mt-1 h-40 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 font-mono text-[10px]"
            readOnly
            value={html}
          />
        </div>
        <div>
          <div className="text-xs font-medium">Review notes</div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 min-h-[80px]" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void decide("approved")}>Approve</Button>
          <Button variant="secondary" onClick={() => void decide("request_changes")}>
            Request changes
          </Button>
          <Button variant="destructive" onClick={() => void decide("rejected")}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
