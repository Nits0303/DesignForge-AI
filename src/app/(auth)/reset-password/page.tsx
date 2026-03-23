"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/shared/PasswordInput";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter.")
      .regex(/[0-9]/, "Must contain at least one number."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
 
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  const parsedReady = useMemo(() => !!email && !!token, [email, token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const parsed = schema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password: parsed.data.password }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage(json.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setMessage("Password updated. You can now sign in.");
      router.push("/login");
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!parsedReady) {
    return (
      <div className="bg-[hsl(var(--surface))] rounded-[var(--radius-card)] border border-[hsl(var(--border))] px-8 py-10 shadow-sm">
        <div className="space-y-2 mb-6 text-center">
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
            Invalid reset link
          </h1>
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={() => router.push("/forgot-password")}>
          Go to reset request
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-[hsl(var(--surface))] rounded-[var(--radius-card)] border border-[hsl(var(--border))] px-8 py-10 shadow-sm">
      <div className="space-y-2 mb-6 text-center">
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
          Set a new password
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Update your password to finish resetting your account.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-xs text-[hsl(var(--foreground))]">
          {message}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Password
          </label>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Confirm password
          </label>
          <PasswordInput
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full mt-2" disabled={submitting}>
          {submitting ? "Updating..." : "Update password"}
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => router.push("/login")}
        >
          Back to login
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

