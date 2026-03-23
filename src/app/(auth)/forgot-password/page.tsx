"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Please enter a valid email."),
});

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setResetUrl(null);

    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Invalid email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setMessage(json.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setMessage("If an account exists for this email, you can reset your password.");
      // In development we return a reset link so you can test the flow end-to-end.
      setResetUrl(json.data?.resetUrl ?? null);
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[hsl(var(--surface))] rounded-[var(--radius-card)] border border-[hsl(var(--border))] px-8 py-10 shadow-sm">
      <div className="space-y-2 mb-6 text-center">
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
          Reset your password
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Enter your email and we will generate a reset link.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-xs text-[hsl(var(--foreground))]">
          {message}
        </div>
      )}

      {resetUrl && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-xs text-[hsl(var(--foreground))]">
          <a className="font-semibold underline" href={resetUrl}>
            Open reset link
          </a>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Email address
          </label>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full mt-2" disabled={submitting}>
          {submitting ? "Generating link..." : "Send reset link"}
        </Button>

        <Button type="button" variant="secondary" className="w-full" onClick={() => router.push("/login")}>
          Back to login
        </Button>
      </form>
    </div>
  );
}

