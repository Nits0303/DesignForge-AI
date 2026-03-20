"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Upload } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const INDUSTRIES = [
  "SaaS / Tech",
  "E-commerce",
  "Food & Beverage",
  "Fitness & Wellness",
  "Finance",
  "Healthcare",
  "Education",
  "Creative / Agency",
  "Real Estate",
  "Other",
] as const;

const FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Source Sans Pro",
  "Playfair Display",
  "Merriweather",
  "Oswald",
] as const;

export type BrandWizardState = {
  name: string;
  industry: string;
  toneVoice: string;
  logoPrimaryUrl: string;
  logoIconUrl: string;
  logoDarkUrl: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    bodyWeight: number;
  };
};

export const DEFAULT_BRAND_STATE: BrandWizardState = {
  name: "",
  industry: "",
  toneVoice: "",
  logoPrimaryUrl: "",
  logoIconUrl: "",
  logoDarkUrl: "",
  colors: {
    primary: "#6366f1",
    secondary: "#8b5cf6",
    accent: "#a78bfa",
    background: "#0f172a",
    text: "#f8fafc",
  },
  typography: {
    headingFont: "Inter",
    bodyFont: "Inter",
    headingWeight: 700,
    bodyWeight: 400,
  },
};

type Props = {
  mode: "onboarding" | "new";
  initial?: Partial<BrandWizardState>;
  allowCopyFromExisting?: boolean;
  existingBrands?: Array<{ id: string; name: string }>;
  onSkip?: () => void;
  onComplete: (payload: BrandWizardState) => Promise<void>;
};

export function BrandWizard({
  mode,
  initial,
  allowCopyFromExisting,
  existingBrands,
  onSkip,
  onComplete,
}: Props) {
  const [step, setStep] = useState(allowCopyFromExisting ? 0 : 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<string>("");

  const [state, setState] = useState<BrandWizardState>({
    ...DEFAULT_BRAND_STATE,
    ...initial,
    colors: { ...DEFAULT_BRAND_STATE.colors, ...(initial?.colors ?? {}) },
    typography: { ...DEFAULT_BRAND_STATE.typography, ...(initial?.typography ?? {}) },
  });

  const progressSteps = useMemo(() => ["Brand", "Logo", "Colors", "Typography"], []);

  useEffect(() => {
    if (!allowCopyFromExisting) return;
    if (!copyFrom) return;
    (async () => {
      const res = await fetch(`/api/brands/${copyFrom}`);
      const j = await res.json();
      if (res.ok && j.success) {
        const b = j.data;
        setState((s) => ({
          ...s,
          name: `${b.name} (Copy)`,
          industry: b.industry ?? "",
          toneVoice: b.toneVoice ?? "",
          logoPrimaryUrl: b.logoPrimaryUrl ?? "",
          logoIconUrl: b.logoIconUrl ?? "",
          logoDarkUrl: b.logoDarkUrl ?? "",
          colors: { ...s.colors, ...(b.colors ?? {}) },
          typography: { ...s.typography, ...(b.typography ?? {}) },
        }));
      }
    })();
  }, [allowCopyFromExisting, copyFrom]);

  const update = <K extends keyof BrandWizardState>(key: K, value: BrandWizardState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  const updateColor = (key: keyof BrandWizardState["colors"], value: string) => {
    setState((s) => ({ ...s, colors: { ...s.colors, [key]: value } }));
  };

  const updateTypography = (key: keyof BrandWizardState["typography"], value: any) => {
    setState((s) => ({ ...s, typography: { ...s.typography, [key]: value } }));
  };

  const next = async () => {
    if (step < 4) setStep(step + 1);
    else {
      setBusy(true);
      setError(null);
      try {
        await onComplete(state);
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setBusy(false);
      }
    }
  };

  const prev = () => {
    if (step === 0) return;
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] px-4 py-6 md:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={prev}
              className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            {progressSteps.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i + 1 === (step === 0 ? 1 : step)
                    ? "bg-[hsl(var(--accent))]"
                    : i + 1 < (step === 0 ? 1 : step)
                      ? "bg-[hsl(var(--accent))]/50"
                      : "bg-[hsl(var(--subtle-foreground))]"
                }`}
              />
            ))}
          </div>
          <div />
        </div>

        {error ? (
          <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
            {error}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Create a new brand</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Start from scratch or copy settings from an existing brand.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 text-left hover:bg-[hsl(var(--surface-elevated))]"
              >
                <div className="text-base font-semibold">Start from scratch</div>
                <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Build a fresh profile with new colors, fonts, and assets.
                </div>
              </button>
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
                <div className="text-base font-semibold">Copy from existing</div>
                <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Pre-fill the wizard with an existing brand profile.
                </div>
                <select
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  className="mt-3 flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                >
                  <option value="">Select a brand...</option>
                  {(existingBrands ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Button className="mt-3 w-full" onClick={() => setStep(1)} disabled={!copyFrom}>
                  Continue
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
              {mode === "onboarding" ? "Let's set up your brand" : "Brand identity"}
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Add your brand name and industry to get started.
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Brand name</label>
                <Input value={state.name} onChange={(e) => update("name", e.target.value)} placeholder="My brand" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Industry</label>
                <select
                  value={state.industry}
                  onChange={(e) => update("industry", e.target.value)}
                  className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                >
                  <option value="">Select...</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={next}>
                Continue
              </Button>
              {onSkip ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  Skip for now
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Upload your logo</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Primary logo is recommended. Icon and dark variant are optional.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { key: "logoPrimaryUrl" as const, label: "Primary logo" },
                { key: "logoIconUrl" as const, label: "Icon / favicon" },
                { key: "logoDarkUrl" as const, label: "Dark variant" },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  className="flex flex-col items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6 transition-colors hover:border-[hsl(var(--accent))]"
                >
                  {state[key] ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={state[key]} alt={label} className="h-20 w-20 object-contain" />
                      <button
                        type="button"
                        onClick={() => update(key, "" as any)}
                        className="absolute -right-2 -top-2 rounded-full bg-[hsl(var(--destructive))] p-1 text-white"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("category", "logo");
                          const res = await fetch("/api/upload/brand-asset", { method: "POST", body: fd });
                          const json = await res.json();
                          if (json.success && json.data?.fileUrl) {
                            update(key, json.data.fileUrl as any);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={next}>
              Continue
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Define your brand colors</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Pick the core colors used across designs.</p>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                {(["primary", "secondary", "accent", "background", "text"] as const).map((k) => (
                  <div key={k} className="space-y-2">
                    <label className="text-sm font-semibold capitalize text-[hsl(var(--foreground))]">{k}</label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-10 w-10 shrink-0 rounded border border-[hsl(var(--border))]"
                        style={{ background: state.colors[k] }}
                      />
                      <Input
                        value={state.colors[k]}
                        onChange={(e) => updateColor(k, e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <HexColorPicker color={state.colors[k]} onChange={(v) => updateColor(k, v)} style={{ width: "100%", height: 80 }} />
                  </div>
                ))}
              </div>
              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="rounded-lg p-4" style={{ background: state.colors.background, color: state.colors.text }}>
                  <div className="text-lg font-bold" style={{ color: state.colors.primary }}>
                    Sample headline
                  </div>
                  <div className="mt-1 text-sm" style={{ color: state.colors.secondary }}>
                    Subheadline text
                  </div>
                  <p className="mt-2 text-sm opacity-90">Body paragraph using your brand colors.</p>
                  <button type="button" className="mt-3 rounded px-3 py-1.5 text-sm font-medium text-white" style={{ background: state.colors.accent }}>
                    CTA Button
                  </button>
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={next}>
              Continue
            </Button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Typography & voice</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Choose fonts and describe tone/voice.</p>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Heading font</label>
                  <select
                    value={state.typography.headingFont}
                    onChange={(e) => updateTypography("headingFont", e.target.value)}
                    className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Body font</label>
                  <select
                    value={state.typography.bodyFont}
                    onChange={(e) => updateTypography("bodyFont", e.target.value)}
                    className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Heading weight</label>
                    <select
                      value={state.typography.headingWeight}
                      onChange={(e) => updateTypography("headingWeight", Number(e.target.value))}
                      className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                    >
                      <option value={700}>Bold 700</option>
                      <option value={600}>Semibold 600</option>
                      <option value={500}>Medium 500</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Body weight</label>
                    <select
                      value={state.typography.bodyWeight}
                      onChange={(e) => updateTypography("bodyWeight", Number(e.target.value))}
                      className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                    >
                      <option value={400}>Regular 400</option>
                      <option value={500}>Medium 500</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-[hsl(var(--foreground))]">Brand tone / voice</label>
                  <Textarea
                    value={state.toneVoice}
                    onChange={(e) => update("toneVoice", e.target.value)}
                    placeholder="Professional yet approachable, modern, innovative..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
                <div className="rounded-lg p-4">
                  <div
                    className="text-xl text-[hsl(var(--foreground))]"
                    style={{ fontFamily: state.typography.headingFont, fontWeight: state.typography.headingWeight }}
                  >
                    Heading preview
                  </div>
                  <div
                    className="mt-2 text-sm text-[hsl(var(--muted-foreground))]"
                    style={{ fontFamily: state.typography.bodyFont, fontWeight: state.typography.bodyWeight }}
                  >
                    Subheadline and body text preview using your selected font pairing.
                  </div>
                  <div className="mt-4">
                    <Button>CTA Button</Button>
                  </div>
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={next} disabled={busy}>
              {busy ? "Saving..." : mode === "onboarding" ? "Create Brand Profile" : "Create Brand"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

