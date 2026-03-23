"use client";

import { useState } from "react";
import Link from "next/link";
import DOMPurify from "dompurify";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  name: string;
  tier: string;
  category: string;
  platform: string;
  htmlSnippet: string;
  tags: string[];
  source: string | null;
  usageCount: number;
  avgApprovalRate: number | null;
  isActive: boolean;
  updatedAt: string;
};

type Props = {
  initialTemplates: Template[];
};

export function AdminTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [editing, setEditing] = useState<Template | null>(null);
  const [snippet, setSnippet] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Template library
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Manage seeded templates. This is a minimal admin view for Sprint 5.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Link className="font-medium text-[hsl(var(--accent))]" href="/templates/contribute">
            Contribute template (as admin preview)
          </Link>
          <span className="text-[hsl(var(--muted-foreground))]">·</span>
          <Link className="font-medium text-[hsl(var(--accent))]" href="/admin/templates/review">
            Review queue
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[hsl(var(--surface-elevated))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Usage</th>
              <th className="px-3 py-2">Approval</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr
                key={tpl.id}
                className="border-t border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
              >
                <td className="px-3 py-2 text-[11px]">{tpl.name}</td>
                <td className="px-3 py-2 text-[11px]">{tpl.tier}</td>
                <td className="px-3 py-2 text-[11px]">{tpl.category}</td>
                <td className="px-3 py-2 text-[11px]">{tpl.platform}</td>
                <td className="px-3 py-2 text-[11px]">{tpl.usageCount}</td>
                <td className="px-3 py-2 text-[11px]">
                  {Math.round((tpl.avgApprovalRate ?? 0.5) * 100)}%
                </td>
                <td className="px-3 py-2 text-[11px]">
                  {tpl.isActive ? "Active" : "Inactive"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(tpl);
                      setSnippet(tpl.htmlSnippet);
                    }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!editing}
        onOpenChange={() => {
          setEditing(null);
          setSnippet("");
        }}
      >
        <DialogContent className="max-w-4xl border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          {editing && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Edit HTML snippet
                </h2>
                <textarea
                  className="h-72 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-xs font-mono text-[hsl(var(--foreground))]"
                  value={snippet}
                  onChange={(e) => setSnippet(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!editing) return;
                    const clean = DOMPurify.sanitize(snippet, { ADD_ATTR: ["style"] });
                    const res = await fetch(`/api/templates/${editing.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ htmlSnippet: clean }),
                    });
                    if (res.ok) {
                      setTemplates((prev) =>
                        prev.map((t) =>
                          t.id === editing.id ? { ...t, htmlSnippet: clean } : t
                        )
                      );
                    }
                  }}
                >
                  Save snippet
                </Button>
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Live preview
                </h2>
                <div className="h-72 overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                  <iframe
                    title={editing.name}
                    srcDoc={snippet}
                    className="h-full w-full border-0"
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

