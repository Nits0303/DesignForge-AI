"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    email: z.string().email("Please enter a valid email."),
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

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
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
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.error?.code === "EMAIL_ALREADY_EXISTS") {
          setFormError("An account with this email already exists.");
        } else if (json.error?.message) {
          setFormError(json.error.message);
        } else {
          setFormError("Something went wrong. Please try again.");
        }
        return;
      }

      const signInResult = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (signInResult?.ok) {
        router.push("/onboarding");
      } else {
        router.push("/login");
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[hsl(var(--surface))] rounded-[var(--radius-card)] border border-[hsl(var(--border))] px-8 py-10 shadow-sm">
      <div className="space-y-2 mb-6 text-center">
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
          Create your account
        </h1>
      </div>

      {formError && (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Full name
          </label>
          <Input autoComplete="name" {...register("name")} />
          <FormFieldError message={errors.name?.message} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Email address
          </label>
          <Input type="email" autoComplete="email" {...register("email")} />
          <FormFieldError message={errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Password
          </label>
          <PasswordInput autoComplete="new-password" {...register("password")} />
          <FormFieldError message={errors.password?.message} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Confirm password
          </label>
          <PasswordInput autoComplete="new-password" {...register("confirmPassword")} />
          <FormFieldError message={errors.confirmPassword?.message} />
        </div>

        <Button
          type="submit"
          className="w-full mt-2"
          disabled={submitting}
        >
          {submitting ? "Creating account..." : "Create account"}
        </Button>

        <DividerWithText text="or" />

        <GoogleAuthButton label="Continue with Google" />
      </form>
    </div>
  );
}

