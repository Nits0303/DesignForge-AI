import { prisma } from "@/lib/db/prisma";
import { AnalyticsPeriod, getPeriodRange } from "@/lib/analytics/period";
import { withTimeout } from "@/lib/analytics/timeout";

export async function getUserQualityTrend(
  userId: string
): Promise<Array<{ weekStart: string; qualityScore: number }>> {
  // Past 12 weeks.
  const end = new Date();
  const start = new Date(end.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  const rows = await withTimeout(
    prisma.$queryRaw<Array<{ weekStart: string; qualityScore: number }>>`
      SELECT
        to_char(date_trunc('week', uqm."date"), 'YYYY-MM-DD') as "weekStart",
        AVG(COALESCE(uqm."designQualityScore", 0))::float as "qualityScore"
      FROM "UserQualityMetric" uqm
      WHERE uqm."userId" = ${userId}
        AND uqm."date" >= ${start}
        AND uqm."date" < ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    10_000
  );

  return rows.map((r) => ({ weekStart: r.weekStart, qualityScore: Number(r.qualityScore ?? 0) }));
}

export async function getActivePreferenceCount(userId: string): Promise<number> {
  return withTimeout(
    prisma.userPreference.count({
      where: { userId, confidence: { gt: 0.6 } },
    }),
    10_000
  );
}

export async function getLearningEngineEffectiveness(): Promise<{
  withPreferences: { avgRevisions: number; userCount: number };
  withoutPreferences: { avgRevisions: number; userCount: number };
  improvementPercent: number | null;
}> {
  // Use latest metric row per user.
  const rows = await withTimeout(
    prisma.$queryRaw<Array<{ activePreferences: number; avgRevisions: number }>>`
      SELECT
        uqm."activePreferences"::int as "activePreferences",
        uqm."avgRevisions"::float as "avgRevisions"
      FROM (
        SELECT DISTINCT ON ("userId")
          "userId",
          "activePreferences",
          "avgRevisions"
        FROM "UserQualityMetric"
        ORDER BY "userId", "date" DESC
      ) uqm
    `,
    10_000
  );

  const withPref = rows.filter((r) => (r.activePreferences ?? 0) > 0);
  const withoutPref = rows.filter((r) => (r.activePreferences ?? 0) === 0);

  const avg = (arr: typeof rows) => (arr.length ? arr.reduce((a, x) => a + Number(x.avgRevisions ?? 0), 0) / arr.length : 0);
  const withAvg = avg(withPref);
  const withoutAvg = avg(withoutPref);

  const improvementPercent = withoutAvg === 0 ? null : ((withoutAvg - withAvg) / withoutAvg) * 100;

  return {
    withPreferences: { avgRevisions: withAvg, userCount: withPref.length },
    withoutPreferences: { avgRevisions: withoutAvg, userCount: withoutPref.length },
    improvementPercent: improvementPercent == null ? null : Number(improvementPercent),
  };
}

export async function getBatchJobAnalytics(userId: string, period: AnalyticsPeriod): Promise<{
  totalBatchJobs: number;
  totalItemsGenerated: number;
  avgBatchSize: number;
  totalCostSavedViaBatchApi: number;
  avgItemsPerBatch: number;
}> {
  const { start, end } = getPeriodRange(period);

  const where: any = { userId };
  if (start) where.createdAt = { gte: start, lt: end };

  const [batches, sumSavings] = await Promise.all([
    withTimeout(
      prisma.batchJob.findMany({
        where,
        select: { id: true, totalItems: true, processingStrategy: true, estimatedCostUsd: true, actualCostUsd: true },
      }),
      10_000
    ),
    // Sum savings separately so we don't depend on JS totals too much.
    withTimeout(
      start
        ? prisma.$queryRaw<Array<{ total: number }>>`
            SELECT
              COALESCE(SUM((b."estimatedCostUsd" - b."actualCostUsd")::float), 0)::float as "total"
            FROM "BatchJob" b
            WHERE b."userId" = ${userId}
              AND b."processingStrategy" = 'anthropic_batch'
              AND b."estimatedCostUsd" IS NOT NULL
              AND b."actualCostUsd" IS NOT NULL
              AND b."createdAt" >= ${start}
              AND b."createdAt" < ${end}
          `
        : prisma.$queryRaw<Array<{ total: number }>>`
        SELECT
          COALESCE(SUM((b."estimatedCostUsd" - b."actualCostUsd")::float), 0)::float as "total"
        FROM "BatchJob" b
        WHERE b."userId" = ${userId}
          AND b."processingStrategy" = 'anthropic_batch'
          AND b."estimatedCostUsd" IS NOT NULL
          AND b."actualCostUsd" IS NOT NULL
      `,
      10_000
    ).catch(() => [{ total: 0 }]),
  ]);

  const totalBatchJobs = batches.length;
  const totalItemsGenerated = batches.reduce((a, b) => a + (b.totalItems ?? 0), 0);
  const avgBatchSize = totalBatchJobs ? totalItemsGenerated / totalBatchJobs : 0;

  // cost saved calculation is based on batch jobs for which we have both estimate and actual.
  const totalCostSavedViaBatchApi = Number((sumSavings[0]?.total ?? 0) as any);
  const avgItemsPerBatch = totalBatchJobs ? totalItemsGenerated / totalBatchJobs : 0;

  return {
    totalBatchJobs,
    totalItemsGenerated,
    avgBatchSize,
    totalCostSavedViaBatchApi,
    avgItemsPerBatch,
  };
}

