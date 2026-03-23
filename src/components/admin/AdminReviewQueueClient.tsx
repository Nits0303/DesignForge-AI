"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  createdAt: string;
  platform: string;
  category: string;
  format: string;
  contributor: { name: string | null; email: string | null } | null;
};

export function AdminReviewQueueClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [counts, setCounts] = useState({ submitted: 0, underReview: 0 });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/templates/review-queue");
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items ?? []);
        setCounts(json.data.counts ?? { submitted: 0, underReview: 0 });
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--warning))]/10 px-4 py-3 text-sm">
        {counts.submitted} templates awaiting review · {counts.underReview} currently under review
      </div>
      <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[hsl(var(--surface-elevated))]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contributor</th>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t border-[hsl(var(--border))]">
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2">{t.contributor?.name ?? t.contributor?.email ?? "—"}</td>
                <td className="px-3 py-2">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  {t.platform} / {t.format} / {t.category}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/templates/review/${t.id}`}
                    className={cn(buttonVariants({ size: "sm" }))}
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
