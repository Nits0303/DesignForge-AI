"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AdminAbTestDetailActions({ testId, status }: { testId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = async (action: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/ab-tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Request failed");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!confirm("Cancel this test? Traffic will stop.")) return;
    await patch("cancel");
  };

  return (
    <div className="space-y-2">
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Test lifecycle actions">
        {status === "draft" && (
          <Button type="button" onClick={() => void patch("launch")} disabled={loading}>
            Launch
          </Button>
        )}
        {status === "paused" && (
          <Button type="button" onClick={() => void patch("resume")} disabled={loading}>
            Resume
          </Button>
        )}
        {status === "running" && (
          <Button type="button" variant="secondary" onClick={() => void patch("pause")} disabled={loading}>
            Pause
          </Button>
        )}
        {status === "paused" && (
          <Button type="button" variant="secondary" onClick={() => void patch("resume")} disabled={loading}>
            Resume
          </Button>
        )}
        {status !== "completed" && status !== "cancelled" && (
          <Button type="button" variant="destructive" onClick={() => void cancel()} disabled={loading}>
            Cancel test
          </Button>
        )}
      </div>
    </div>
  );
}
