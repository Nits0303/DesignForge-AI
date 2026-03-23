import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

/** Precomputed chi-square (df=1) survival: P(X > t) for t = i * 0.01, i=0..2000 */
const CHI_SQ1_SURVIVAL_TABLE: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i <= 2000; i++) {
    const t = i * 0.01;
    const z = Math.sqrt(Math.max(t, 0));
    out.push(chiSq1SurvivalExact(z));
  }
  return out;
})();

function chiSq1SurvivalExact(sqrtChi: number): number {
  // X = Z^2, Z ~ N(0,1): P(X > t) = 2*(1 - Phi(sqrt(t)))
  const phi = normalCdf(sqrtChi);
  return 2 * (1 - phi);
}

function erfApprox(x: number): number {
  const sign = Math.sign(x);
  const x1 = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x1);
  const y =
    1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x1 * x1);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erfApprox(z / Math.SQRT2));
}

function chiSquarePValueDf1(chi2: number): number {
  if (chi2 <= 0) return 1;
  const idx = Math.min(2000, Math.round(chi2 * 100));
  return CHI_SQ1_SURVIVAL_TABLE[idx] ?? chiSq1SurvivalExact(Math.sqrt(chi2));
}

/** Bayesian P(p_A > p_B) with Beta priors Beta(1,1), successes/failures observed. */
function bayesianProbAGreaterThanB(aSuccess: number, aFail: number, bSuccess: number, bFail: number): number {
  const samples = 800;
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const pa = betaRandom(aSuccess + 1, aFail + 1);
    const pb = betaRandom(bSuccess + 1, bFail + 1);
    if (pa > pb) wins++;
  }
  return wins / samples;
}

function betaRandom(a: number, b: number): number {
  const x = gammaRandom(a);
  const y = gammaRandom(b);
  return x / (x + y);
}

function gammaRandom(shape: number): number {
  if (shape < 1) return gammaRandom(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalRandom(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function cohenH(p1: number, p2: number): number {
  const phi = (p: number) => 2 * Math.asin(Math.sqrt(Math.max(0.0001, Math.min(0.9999, p))));
  return Math.abs(phi(p1) - phi(p2));
}

function effectSizeLabel(h: number): "small" | "medium" | "large" {
  if (h < 0.2) return "small";
  if (h < 0.5) return "medium";
  return "large";
}

function contingencyChiSquare(
  rows: number[][]
): { chi2: number; pValue: number; df: number } {
  const r = rows.length;
  const c = rows[0]?.length ?? 0;
  const rowSum = rows.map((row) => row.reduce((a, b) => a + b, 0));
  const colSum = Array.from({ length: c }, (_, j) => rows.reduce((a, row) => a + (row[j] ?? 0), 0));
  const n = rowSum.reduce((a, b) => a + b, 0);
  if (n === 0) return { chi2: 0, pValue: 1, df: (r - 1) * (c - 1) };
  let chi2 = 0;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const o = rows[i]![j]!;
      const e = (rowSum[i]! * colSum[j]!) / n;
      if (e > 0) chi2 += ((o - e) * (o - e)) / e;
    }
  }
  const df = (r - 1) * (c - 1);
  const pValue = df === 1 ? chiSquarePValueDf1(chi2) : approximateChiSquareP(chi2, df);
  return { chi2, pValue, df };
}

function approximateChiSquareP(chi2: number, df: number): number {
  if (df <= 1) return chiSquarePValueDf1(chi2);
  const z = (Math.pow(chi2 / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  const survival = 1 - normalCdf(z);
  return Math.max(0.0001, Math.min(1, survival));
}

export type VariantMetricRow = {
  variantId: string;
  variantName: string;
  generationCount: number;
  approvedCount: number;
  zeroRevisionCount: number;
  avgRevisions: number;
  avgCostUsd: number;
  avgGenerationTimeMs: number;
  promptScore: number | null;
  approvalRate: number;
  zeroRevisionRate: number;
};

async function getAdjustedAlpha(testId: string, baseThreshold: number): Promise<{
  adjusted: number;
  checkCount: number;
}> {
  const key = `abtest:eval:checks:${testId}`;
  const raw = await redis.get(key);
  const checkCount = raw ? parseInt(raw, 10) || 0 : 0;
  const adjusted = Math.max(0.01, baseThreshold * Math.pow(0.9, checkCount));
  return { adjusted, checkCount };
}

export async function incrementAbTestCheckCount(testId: string): Promise<number> {
  const key = `abtest:eval:checks:${testId}`;
  const n = await redis.incr(key);
  await redis.expire(key, 60 * 60 * 24 * 365);
  return n;
}

function logRelevantToTest(
  log: { testAssignments: unknown; testVariantId: string | null },
  testId: string,
  variantIds: Set<string>
): boolean {
  const arr = log.testAssignments as Array<{ testId?: string }> | null | undefined;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.some((x) => x && String(x.testId) === testId);
  }
  if (log.testVariantId && variantIds.has(log.testVariantId)) return true;
  return false;
}

function variantIdForLog(
  log: { testAssignments: unknown; testVariantId: string | null },
  testId: string,
  variantIds: Set<string>
): string | null {
  const arr = log.testAssignments as Array<{ testId?: string; variantId?: string }> | null | undefined;
  if (Array.isArray(arr) && arr.length > 0) {
    const hit = arr.find((x) => x && String(x.testId) === testId);
    if (hit?.variantId) return String(hit.variantId);
    return null;
  }
  if (log.testVariantId && variantIds.has(log.testVariantId)) return log.testVariantId;
  return null;
}

export async function evaluatePromptABTest(testId: string, now = new Date()) {
  const test = await prisma.promptABTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("PromptABTest not found");

  const variants = (test.variants as Array<{ id: string; name?: string }>) ?? [];
  const variantIds = new Set(variants.map((v) => String(v.id)));
  const endDate = test.endDate ?? now;

  const { adjusted: adjustedAlpha, checkCount } = await getAdjustedAlpha(testId, test.significanceThreshold);

  /* PERFORMANCE: A/B eval scans GenerationLog by time — relies on @@index([userId, createdAt]) and createdAt range; narrow further with raw SQL if volume grows. */
  const logs = await prisma.generationLog.findMany({
    where: {
      createdAt: { gte: test.startDate, lt: endDate },
      OR: [{ testAssignments: { not: Prisma.DbNull } }, { testVariantId: { not: null } }],
    },
    select: {
      testAssignments: true,
      testVariantId: true,
      revisionCount: true,
      wasApproved: true,
      costUsd: true,
      generationTimeMs: true,
      promptStructureHash: true,
    },
  });

  const relevant = logs.filter((l) => logRelevantToTest(l, testId, variantIds));

  const byVariant = new Map<
    string,
    {
      gen: typeof logs;
      zeroRev: number;
      approved: number;
      zeroRevApproved: number;
      revSum: number;
      costSum: number;
      timeSum: number;
      timeN: number;
    }
  >();

  for (const v of variants) {
    byVariant.set(String(v.id), {
      gen: [],
      zeroRev: 0,
      approved: 0,
      zeroRevApproved: 0,
      revSum: 0,
      costSum: 0,
      timeSum: 0,
      timeN: 0,
    });
  }

  for (const log of relevant) {
    const vid = variantIdForLog(log, testId, variantIds);
    if (!vid || !byVariant.has(vid)) continue;
    const bucket = byVariant.get(vid)!;
    bucket.gen.push(log);
    const rc = log.revisionCount ?? 0;
    if (rc === 0) bucket.zeroRev += 1;
    if (log.wasApproved === true) {
      bucket.approved += 1;
      if (rc === 0) bucket.zeroRevApproved += 1;
    }
    bucket.revSum += rc;
    if (typeof log.costUsd === "number") bucket.costSum += log.costUsd;
    if (typeof log.generationTimeMs === "number") {
      bucket.timeSum += log.generationTimeMs;
      bucket.timeN += 1;
    }
  }

  const variantResults: VariantMetricRow[] = [];

  for (const v of variants) {
    const id = String(v.id);
    const b = byVariant.get(id)!;
    const n = b.gen.length;
    const approvedCount = b.approved;
    const zeroRevisionCount = b.zeroRev;
    const avgRevisions = n === 0 ? 0 : b.revSum / n;
    const avgCostUsd = n === 0 ? 0 : b.costSum / n;
    const avgGenerationTimeMs = b.timeN === 0 ? 0 : b.timeSum / b.timeN;
    const approvalRate = n === 0 ? 0 : approvedCount / n;
    const zeroRevisionRate = n === 0 ? 0 : zeroRevisionCount / n;

    let promptScore: number | null = null;
    const hashes = Array.from(
      new Set(b.gen.map((l) => l.promptStructureHash).filter(Boolean))
    ) as string[];
    if (hashes.length) {
      const scores = await prisma.promptScore.findMany({
        where: { promptStructureHash: { in: hashes } },
        select: { promptStructureHash: true, score: true },
      });
      const scoreMap = new Map(scores.map((s) => [s.promptStructureHash, s.score]));
      const scored = b.gen
        .map((l) => (l.promptStructureHash ? scoreMap.get(l.promptStructureHash) : null))
        .filter((x): x is number => typeof x === "number");
      promptScore = scored.length ? scored.reduce((a, x) => a + x, 0) / scored.length : null;
    }

    variantResults.push({
      variantId: id,
      variantName: String(v.name ?? id),
      generationCount: n,
      approvedCount,
      zeroRevisionCount,
      avgRevisions,
      avgCostUsd,
      avgGenerationTimeMs,
      promptScore,
      approvalRate,
      zeroRevisionRate,
    });
  }

  const minOk = variantResults.every((r) => r.generationCount >= test.minSamplesPerVariant);
  if (!minOk || variants.length < 2) {
    return {
      testId,
      minSampleReached: false,
      sampleSufficient: false,
      variantResults,
      significanceResult: null,
      recommendedWinner: null,
      pValue: null as number | null,
      chi2: null as number | null,
      winnerVariantId: null as string | null,
      adjustedAlpha,
      checkCount,
      bayesianConfidence: null as number | null,
    };
  }

  // Binary outcome: zero revisions vs at least one (all generations).
  const table = variantResults.map((r) => [r.zeroRevisionCount, r.generationCount - r.zeroRevisionCount]);
  const omnibus = contingencyChiSquare(table);

  let best = variantResults[0]!;
  for (const r of variantResults) {
    if (r.zeroRevisionRate > best.zeroRevisionRate) best = r;
  }

  const others = variantResults.filter((r) => r.variantId !== best.variantId);
  const mergedOthers = others.reduce(
    (acc, r) => ({
      z: acc.z + r.zeroRevisionCount,
      n: acc.n + r.generationCount,
    }),
    { z: 0, n: 0 }
  );
  const pairTable = [
    [best.zeroRevisionCount, best.generationCount - best.zeroRevisionCount],
    [mergedOthers.z, mergedOthers.n - mergedOthers.z],
  ];
  const pairwise = contingencyChiSquare(pairTable);

  const pBest = best.generationCount ? best.zeroRevisionCount / best.generationCount : 0;
  const pOther = mergedOthers.n ? mergedOthers.z / mergedOthers.n : 0;
  const h = cohenH(pBest, pOther);
  const effectLabel = effectSizeLabel(h);

  const bSuccess = best.zeroRevisionCount;
  const bFail = best.generationCount - bSuccess;
  const oSuccess = mergedOthers.z;
  const oFail = mergedOthers.n - oSuccess;
  const bayesianConfidence = bayesianProbAGreaterThanB(bSuccess, bFail, oSuccess, oFail);

  const omnibusSig = omnibus.pValue < adjustedAlpha;
  const pairSig = pairwise.pValue < adjustedAlpha;
  const mediumOrLarge = h >= 0.2;

  const recommendedWinner =
    omnibusSig && pairSig && mediumOrLarge ? best.variantId : null;

  const significanceResult = {
    omnibusChi2: omnibus.chi2,
    omnibusP: omnibus.pValue,
    pairwiseChi2: pairwise.chi2,
    pairwiseP: pairwise.pValue,
    cohenH: h,
    effectSizeLabel: effectLabel,
    bayesianConfidence,
    adjustedAlpha,
    checkCount,
    significant: !!(omnibusSig && pairSig),
  };

  return {
    testId,
    minSampleReached: true,
    sampleSufficient: true,
    variantResults,
    significanceResult,
    recommendedWinner,
    pValue: pairwise.pValue,
    chi2: pairwise.chi2,
    winnerVariantId: null as string | null,
    adjustedAlpha,
    checkCount,
    bayesianConfidence: bayesianConfidence ?? null,
  };
}
