"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { DividerWithText } from "@/components/shared/DividerWithText";
import { FormFieldError } from "@/components/shared/FormFieldError";
import { GoogleAuthButton } from "@/components/shared/GoogleAuthButton";

const schema = z.object({
  email: z.string().email("Please enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const oauthError = searchParams.get("error") === "oauth_failed";
  const oauthErrorCode = searchParams.get("error");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setSubmitting(true);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
      callbackUrl,
    });
    setSubmitting(false);

    if (!result || result.error) {
      setFormError("Invalid email or password.");
      return;
    }

    if (result.url) {
      router.push(result.url);
    }
  };

  return (
    <div className="bg-[hsl(var(--surface))] rounded-[var(--radius-card)] border border-[hsl(var(--border))] px-8 py-10 shadow-sm">
      <div className="space-y-2 mb-6 text-center">
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
          Sign in to your account
        </h1>
      </div>

      {oauthError && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
          Google sign-in was cancelled or failed. Please try again.
        </div>
      )}

      {oauthErrorCode && oauthErrorCode !== "oauth_failed" && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
          Google sign-in failed: <span className="font-mono">{oauthErrorCode}</span>
        </div>
      )}

      {formError && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Email address
          </label>
          <Input
            type="email"
            autoComplete="email"
            {...register("email")}
          />
          <FormFieldError message={errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[hsl(var(--foreground))]">
              Password
            </span>
            <a
              href="/forgot-password"
              className="font-semibold text-[hsl(var(--accent))] text-xs"
            >
              Forgot password?
            </a>
          </div>
          <PasswordInput autoComplete="current-password" {...register("password")} />
          <FormFieldError message={errors.password?.message} />
        </div>

        <Button
          type="submit"
          className="w-full mt-2"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </Button>

        <DividerWithText text="or" />

        <GoogleAuthButton label="Sign in with Google" />
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

