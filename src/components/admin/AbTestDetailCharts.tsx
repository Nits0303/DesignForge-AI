"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

type VariantRow = {
  variantId?: string;
  variantName?: string;
  approvalRate?: number;
  zeroRevisionRate?: number;
  generationCount?: number;
};

function normalizeRows(raw: unknown): VariantRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => (r && typeof r === "object" ? (r as VariantRow) : {}));
}

function SigSummary({ sig }: { sig: Record<string, unknown> | null }) {
  if (!sig) return null;
  const pairP = typeof sig.pairwiseP === "number" ? sig.pairwiseP : null;
  const omniP = typeof sig.omnibusP === "number" ? sig.omnibusP : null;
  const h = typeof sig.cohenH === "number" ? sig.cohenH : null;
  const label = typeof sig.effectSizeLabel === "string" ? sig.effectSizeLabel : null;
  return (
    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
      <div className="font-semibold text-[hsl(var(--foreground))]">Significance (latest)</div>
      <p className="mt-1">
        Omnibus p: {omniP != null ? omniP.toFixed(4) : "—"} · Pairwise p: {pairP != null ? pairP.toFixed(4) : "—"}
        {h != null ? ` · Cohen h: ${h.toFixed(3)} (${label ?? "effect"})` : null}
      </p>
    </div>
  );
}

export function AbTestDetailCharts({
  variantResults,
  significanceResult,
}: {
  variantResults: unknown;
  significanceResult?: unknown;
}) {
  const rows = normalizeRows(variantResults);
  if (!rows.length) return null;

  const sig =
    significanceResult && typeof significanceResult === "object"
      ? (significanceResult as Record<string, unknown>)
      : null;

  const data = rows.map((r) => ({
    name: String(r.variantName ?? r.variantId ?? "?").slice(0, 24),
    approval: typeof r.approvalRate === "number" ? Math.round(r.approvalRate * 1000) / 10 : 0,
    zeroRev: typeof r.zeroRevisionRate === "number" ? Math.round(r.zeroRevisionRate * 1000) / 10 : 0,
    n: typeof r.generationCount === "number" ? r.generationCount : 0,
  }));

  const scatterPts = rows.map((r) => ({
    n: typeof r.generationCount === "number" ? r.generationCount : 0,
    zeroPct:
      typeof r.zeroRevisionRate === "number" ? Math.round(r.zeroRevisionRate * 1000) / 10 : 0,
    label: String(r.variantName ?? r.variantId ?? "?").slice(0, 20),
  }));

  return (
    <div className="space-y-6">
      {sig ? <SigSummary sig={sig} /> : null}

      <div className="space-y-2">
        <div className="text-sm font-semibold">Variant metrics (latest run)</div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Approval rate and zero-revision rate (%). Sample size (n) in tooltip.
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-[hsl(var(--border))]" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                formatter={(value, name) => {
                  const v = typeof value === "number" ? value : Number(value);
                  const key = String(name);
                  return [
                    `${Number.isFinite(v) ? v : 0}%`,
                    key === "approval" ? "Approval rate" : "Zero-revision rate",
                  ];
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { n?: number } | undefined;
                  return p?.n != null ? `n = ${p.n}` : "";
                }}
              />
              <Bar dataKey="approval" fill="hsl(var(--accent))" name="approval" radius={[4, 4, 0, 0]} />
              <Bar dataKey="zeroRev" fill="hsl(var(--muted-foreground))" name="zeroRev" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Sample size vs zero-revision rate</div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Each point is a variant (n vs zero-revision %). Larger n tightens inference.
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-[hsl(var(--border))]" />
              <XAxis dataKey="n" name="n" type="number" tick={{ fontSize: 11 }} label={{ value: "n", position: "bottom", offset: 0 }} />
              <YAxis dataKey="zeroPct" name="Zero-rev %" type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value) => {
                  const v = typeof value === "number" ? value : Number(value);
                  return [`${Number.isFinite(v) ? v : 0}%`, "Zero-revision"];
                }}
              />
              <Scatter name="Variants" data={scatterPts} fill="hsl(var(--accent))" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
