"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  computeMinimumDetectableEffectAbsolute,
  mdeRelativeToBaseline,
} from "@/lib/learning/abTestMde";

type VariantDraft = {
  id: string;
  name: string;
  allocationPercent: number;
  systemPromptVersion: string;
  additionalInstruction: string;
};

function newVariant(name: string, version: string): VariantDraft {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Math.random().toString(36).slice(2)}`,
    name,
    allocationPercent: 50,
    systemPromptVersion: version,
    additionalInstruction: "",
  };
}

export function AdminAbTestCreateWizard({
  suggestionConfig,
}: {
  suggestionConfig?: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [defaultVersion, setDefaultVersion] = useState("generation-v1.1.0");
  const [versionOptions, setVersionOptions] = useState<string[]>(["generation-v1.1.0", "v1.0.0"]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [format, setFormat] = useState("feed");

  const [variants, setVariants] = useState<VariantDraft[]>(() => [
    newVariant("Control", "generation-v1.1.0"),
    newVariant("Variant B", "generation-v1.1.0"),
  ]);

  const [minSamples, setMinSamples] = useState(50);
  const [significance, setSignificance] = useState(0.05);
  const [baselineRate, setBaselineRate] = useState(0.35);
  const [power, setPower] = useState(0.8);
  const [autoPromote, setAutoPromote] = useState(false);
  const [holdback, setHoldback] = useState(0);
  const [excludeNewUsers, setExcludeNewUsers] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/prompt-versions");
        const json = await res.json();
        if (!res.ok || !json?.success) return;
        const vers = (json.data?.versions ?? []) as Array<{ version: string }>;
        const keys = [...new Set(vers.map((v) => v.version))];
        if (keys.length) {
          setVersionOptions(keys);
          setDefaultVersion(keys[0]!);
          setVariants((prev) =>
            prev.map((v) => ({ ...v, systemPromptVersion: keys.includes(v.systemPromptVersion) ? v.systemPromptVersion : keys[0]! }))
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!suggestionConfig || typeof suggestionConfig !== "object") return;
    const sc = suggestionConfig as Record<string, unknown>;
    if (typeof sc.name === "string") setName(sc.name);
    if (typeof sc.description === "string") setDescription(sc.description);
    if (typeof sc.platform === "string") setPlatform(sc.platform);
    if (typeof sc.format === "string") setFormat(sc.format);
    if (typeof sc.minSamplesPerVariant === "number") setMinSamples(sc.minSamplesPerVariant);
    if (typeof sc.significanceThreshold === "number") setSignificance(sc.significanceThreshold);
    if (typeof sc.autoPromoteWinner === "boolean") setAutoPromote(sc.autoPromoteWinner);
    if (typeof sc.holdbackPercent === "number") setHoldback(sc.holdbackPercent);
    if (typeof sc.excludeNewUsers === "boolean") setExcludeNewUsers(sc.excludeNewUsers);
    const vars = sc.variants;
    if (Array.isArray(vars) && vars.length >= 2) {
      setVariants(
        vars.slice(0, 4).map((raw: unknown) => {
          const v = raw as Record<string, unknown>;
          const pm = (v.promptModifications ?? {}) as Record<string, unknown>;
          return {
            id: typeof v.id === "string" ? v.id : newVariant("Variant", defaultVersion).id,
            name: typeof v.name === "string" ? v.name : "Variant",
            allocationPercent: typeof v.allocationPercent === "number" ? v.allocationPercent : 50,
            systemPromptVersion:
              typeof pm.systemPromptVersion === "string"
                ? pm.systemPromptVersion
                : typeof v.systemPromptVersion === "string"
                  ? (v.systemPromptVersion as string)
                  : defaultVersion,
            additionalInstruction: typeof pm.additionalInstruction === "string" ? pm.additionalInstruction : "",
          };
        })
      );
    }
  }, [suggestionConfig, defaultVersion]);

  const mdePreview = useMemo(() => {
    const absoluteMde = computeMinimumDetectableEffectAbsolute({
      minSamplesPerVariant: minSamples,
      baselineRate,
      significanceThreshold: significance,
      power,
    });
    return {
      absoluteMde,
      relativeMde: mdeRelativeToBaseline(absoluteMde, baselineRate),
      absoluteMdePercent: absoluteMde * 100,
    };
  }, [minSamples, baselineRate, significance, power]);

  const mdeCurve = useMemo(() => {
    const curve: Array<{ n: number; mde: number }> = [];
    for (let n = 20; n <= 500; n += 20) {
      const abs = computeMinimumDetectableEffectAbsolute({
        minSamplesPerVariant: n,
        baselineRate,
        significanceThreshold: significance,
        power,
      });
      curve.push({ n, mde: abs * 100 });
    }
    return curve;
  }, [baselineRate, significance, power]);

  const sensitivityRows = useMemo(() => {
    const ns = [50, 100, 150, 200, 250, 300, 400, 500];
    return ns.map((n) => {
      const abs = computeMinimumDetectableEffectAbsolute({
        minSamplesPerVariant: n,
        baselineRate,
        significanceThreshold: significance,
        power,
      });
      return {
        n,
        mdePp: abs * 100,
        relPct: mdeRelativeToBaseline(abs, baselineRate) * 100,
      };
    });
  }, [baselineRate, significance, power]);

  const allocTotal = useMemo(() => variants.reduce((a, v) => a + Number(v.allocationPercent || 0), 0), [variants]);

  const updateVariant = (id: string, patch: Partial<VariantDraft>) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVariant = () => {
    if (variants.length >= 4) return;
    setVariants((prev) => [...prev, newVariant(`Variant ${String.fromCharCode(65 + prev.length)}`, defaultVersion)]);
  };

  const removeVariant = (id: string) => {
    if (variants.length <= 2) return;
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const submit = async () => {
    setError(null);
    if (Math.abs(allocTotal - 100) > 0.01) {
      setError("Allocations must sum to 100%.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        platform,
        format,
        variants: variants.map((v) => ({
          id: v.id,
          name: v.name,
          allocationPercent: v.allocationPercent,
          promptModifications: {
            ...(v.systemPromptVersion.trim() ? { systemPromptVersion: v.systemPromptVersion.trim() } : {}),
            ...(v.additionalInstruction.trim() ? { additionalInstruction: v.additionalInstruction.trim() } : {}),
          },
        })),
        minSamplesPerVariant: minSamples,
        significanceThreshold: significance,
        baselineRate,
        power,
        autoPromoteWinner: autoPromote,
        holdbackPercent: holdback,
        excludeNewUsers,
      };
      const res = await fetch("/api/admin/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Create failed");
      const testId = json.data?.test?.id;
      if (testId) router.push(`/admin/tests/${testId}`);
      else router.push("/admin/analytics");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`rounded-full px-3 py-1 font-semibold ${
              step === s ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]" : "bg-[hsl(var(--surface-elevated))]"
            }`}
          >
            {s}. {s === 1 ? "Basics" : s === 2 ? "Variants" : "Power & MDE"}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}

      {step === 1 ? (
        <Card className="space-y-4 p-4">
          <div className="text-sm font-semibold">Test basics</div>
          <label className="block space-y-1">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Name *</span>
            <input
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Feed headline density"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Description</span>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Platform</span>
              <input
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Format</span>
              <input
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={!name.trim()}>
              Next
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Variants (2–4)</div>
            <Button type="button" size="sm" variant="secondary" onClick={addVariant} disabled={variants.length >= 4}>
              Add variant
            </Button>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Allocation total: <strong>{allocTotal.toFixed(1)}%</strong> (must equal 100)
          </p>
          <div className="space-y-4">
            {variants.map((v) => (
              <div key={v.id} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">Label</span>
                    <input
                      className="w-36 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1.5 text-sm"
                      value={v.name}
                      onChange={(e) => updateVariant(v.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">%</span>
                    <input
                      type="number"
                      className="w-20 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1.5 text-sm"
                      value={v.allocationPercent}
                      onChange={(e) => updateVariant(v.id, { allocationPercent: Number(e.target.value) })}
                    />
                  </label>
                  <label className="min-w-[200px] flex-1 space-y-1">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">System prompt version</span>
                    <select
                      className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1.5 text-sm"
                      value={v.systemPromptVersion}
                      onChange={(e) => updateVariant(v.id, { systemPromptVersion: e.target.value })}
                    >
                      {versionOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                  {variants.length > 2 ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => removeVariant(v.id)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Additional instruction (optional)</span>
                  <textarea
                    className="min-h-[56px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1.5 text-xs"
                    value={v.additionalInstruction}
                    onChange={(e) => updateVariant(v.id, { additionalInstruction: e.target.value })}
                    placeholder="Appended to user prompt for this variant"
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(3)} disabled={Math.abs(allocTotal - 100) > 0.01}>
              Next
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-4 p-4">
          <div className="text-sm font-semibold">Sample size, power, and MDE</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Min samples / variant</span>
              <input
                type="number"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={minSamples}
                min={20}
                onChange={(e) => setMinSamples(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Significance α (two-sided)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={significance}
                onChange={(e) => setSignificance(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Baseline event rate (0–1)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={baselineRate}
                onChange={(e) => setBaselineRate(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Power</span>
              <input
                type="number"
                step="0.05"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={power}
                onChange={(e) => setPower(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoPromote} onChange={(e) => setAutoPromote(e.target.checked)} />
              Auto-promote winner
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Holdback %</span>
              <input
                type="number"
                className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                value={holdback}
                min={0}
                max={90}
                onChange={(e) => setHoldback(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={excludeNewUsers} onChange={(e) => setExcludeNewUsers(e.target.checked)} />
              Exclude brand-new users (&lt; 3 prior generations)
            </label>
          </div>

          {mdePreview ? (
            <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm">
              <div className="font-semibold">Estimated minimum detectable effect</div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Absolute difference in proportion ≈ <strong>{(mdePreview.absoluteMde * 100).toFixed(2)}</strong> pp ·
                Relative to baseline ≈ <strong>{(mdePreview.relativeMde * 100).toFixed(1)}%</strong> lift
              </p>
            </div>
          ) : null}

          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm">
            <div className="font-semibold">Sensitivity grid (frequentist MDE)</div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Smaller MDE (pp) at higher <code className="text-[10px]">n</code> per arm. Same α, power, and baseline as above.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                    <th className="py-1 pr-3 text-left">n / variant</th>
                    <th className="py-1 pr-3 text-right">MDE (pp)</th>
                    <th className="py-1 text-right">Rel. to baseline (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityRows.map((row) => (
                    <tr key={row.n} className="border-t border-[hsl(var(--border))]">
                      <td className="py-1 pr-3 font-mono">{row.n}</td>
                      <td className="py-1 pr-3 text-right font-mono">{row.mdePp.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">{row.relPct.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm">
            <div className="font-semibold">Bayesian &amp; nightly evaluation</div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              The wizard uses a <strong>frequentist</strong> MDE approximation for planning. After launch, the nightly job
              computes chi-square / pairwise tests and a <strong>Bayesian posterior</strong> confidence that the leading
              variant beats the pooled others on zero-revision rate — see latest{" "}
              <code className="text-[10px]">ABTestResult</code> and the test detail page. This UI does not replace a
              formal power analysis for multiple concurrent metrics.
            </p>
          </div>

          {mdeCurve.length ? (
            <div className="h-48 w-full">
              <div className="mb-1 text-xs text-[hsl(var(--muted-foreground))]">MDE (pp) vs sample size / variant</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mdeCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="n" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="mde" stroke="hsl(var(--accent))" dot={false} name="MDE (pp)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="flex justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create draft test"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
