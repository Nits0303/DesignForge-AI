/**
 * Minimum detectable absolute difference between two proportions (binary outcome),
 * for equal sample sizes per variant, two-sided test, normal approximation.
 *
 * δ ≈ (z_{α/2} + z_β) * sqrt(2 * p * (1-p) / n)
 * where p = baseline event rate, n = samples per arm.
 */
export function computeMinimumDetectableEffectAbsolute(args: {
  minSamplesPerVariant: number;
  baselineRate: number;
  /** Two-sided significance level (e.g. 0.05) */
  significanceThreshold: number;
  /** Statistical power (default 0.8) */
  power?: number;
}): number {
  const n = Math.max(1, args.minSamplesPerVariant);
  const p = Math.min(0.99, Math.max(0.01, args.baselineRate));
  const alpha = Math.min(0.5, Math.max(0.001, args.significanceThreshold));
  const power = args.power ?? 0.8;
  const zAlpha = normalQuantileTwoSided(alpha);
  const zBeta = normalQuantileOneSided(power);
  return (zAlpha + zBeta) * Math.sqrt((2 * p * (1 - p)) / n);
}

/** Relative MDE as fraction of baseline rate (for display). */
export function mdeRelativeToBaseline(absoluteMde: number, baselineRate: number): number {
  const b = Math.max(0.01, baselineRate);
  return absoluteMde / b;
}

/** Inverse normal CDF approximation (Acklam) for p in (0,1). */
function inverseNormalCdf(p: number): number {
  if (p <= 0 || p >= 1) return p <= 0 ? -8 : 8;
  const a1 = -39.6968302866538;
  const a2 = 220.946098424521;
  const a3 = -275.928510446969;
  const a4 = 138.357751867269;
  const a5 = -30.6647980661472;
  const a6 = 2.50662827745924;
  const b1 = -54.4760987982241;
  const b2 = 161.585836858041;
  const b3 = -155.698979859887;
  const b4 = 66.8013118877197;
  const b5 = -13.2806815528857;
  const c1 = -0.00778489400204093;
  const c2 = -0.322396458041136;
  const c3 = -2.40075827716184;
  const c4 = -2.54973253934373;
  const c5 = 4.37466414146497;
  const c6 = 2.93816398269878;
  const d1 = 0.00778469570904146;
  const d2 = 0.32246712907904;
  const d3 = 2.4451341821432;
  const d4 = 3.75440866190742;
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
  if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
  q = p - 0.5;
  r = q * q;
  return (
    (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) *
    q /
    (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
  );
}

function normalQuantileTwoSided(alpha: number): number {
  return inverseNormalCdf(1 - alpha / 2);
}

/** z such that Φ(z) = power (one-sided critical value for power). */
function normalQuantileOneSided(power: number): number {
  return inverseNormalCdf(power);
}
