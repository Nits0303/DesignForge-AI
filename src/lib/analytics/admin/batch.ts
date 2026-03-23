import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";

export type AdminBatchAnalytics = {
  totalBatchJobs: number;
  anthropicBatchAdoptionRate: number | null;
  avgBatchCompletionTimeMs: number | null;
  failureRate: number | null;
  totalBatchDesignsGenerated: number;
  totalIndividualDesignsGenerated: number;
  batchTrendLast30d: Array<{ date: string; batchJobs: number }>;
  strategySplit: Array<{ strategy: string; count: number }>;
};

export async function getAdminBatchAnalytics(): Promise<AdminBatchAnalytics> {
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalBatchJobs,
    batchJobs,
    batchDesignsGenerated,
    individualDesignsGenerated,
    trendRows,
    strategyRows,
  ] = await Promise.all([
    withTimeout(prisma.batchJob.count(), 10_000),
    withTimeout(
      prisma.batchJob.findMany({
        select: { status: true, processingStrategy: true, startedAt: true, completedAt: true },
      }),
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as "count"
        FROM "BatchItem" bi
        WHERE bi."status" IN ('approved','complete')
      `,
      10_000
    ).then((r) => r[0]?.count ?? 0),
    withTimeout(
      prisma.design.count(),
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ date: string; batchJobs: number }>>`
        SELECT
          to_char(date_trunc('day', bj."createdAt"), 'YYYY-MM-DD') as "date",
          COUNT(*)::int as "batchJobs"
        FROM "BatchJob" bj
        WHERE bj."createdAt" >= ${since30d}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ strategy: string; count: number }>>`
        SELECT
          bj."processingStrategy"::text as "strategy",
          COUNT(*)::int as "count"
        FROM "BatchJob" bj
        GROUP BY 1
      `,
      10_000
    ),
  ]);

  const anthropicBatchCount = batchJobs.filter((b) => b.processingStrategy === "anthropic_batch").length;
  const anthropicBatchAdoptionRate = totalBatchJobs ? (anthropicBatchCount / totalBatchJobs) * 100 : null;

  const completionTimes = batchJobs
    .filter((b) => b.startedAt && b.completedAt)
    .map((b) => (b.completedAt!.getTime() - b.startedAt!.getTime()) as number);
  const avgBatchCompletionTimeMs = completionTimes.length ? completionTimes.reduce((a, x) => a + x, 0) / completionTimes.length : null;

  const failedCount = batchJobs.filter((b) => b.status === "failed").length;
  const failureRate = totalBatchJobs ? (failedCount / totalBatchJobs) * 100 : null;

  return {
    totalBatchJobs,
    anthropicBatchAdoptionRate,
    avgBatchCompletionTimeMs,
    failureRate,
    totalBatchDesignsGenerated: batchDesignsGenerated,
    totalIndividualDesignsGenerated: individualDesignsGenerated,
    batchTrendLast30d: trendRows.map((r) => ({ date: r.date, batchJobs: Number(r.batchJobs ?? 0) })),
    strategySplit: strategyRows.map((r) => ({ strategy: r.strategy, count: Number(r.count ?? 0) })),
  };
}

