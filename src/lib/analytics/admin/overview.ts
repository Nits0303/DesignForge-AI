import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";
import { ensureDailySystemMetricTable } from "@/lib/analytics/dailySnapshots";

/* PERFORMANCE: aggregates below scan time-ranged tables; indexes on GenerationLog(createdAt), Design(createdAt) help. */

export async function getAdminOverview(): Promise<{
  totalUsers: number;
  totalDesignsGenerated: number;
  designsToday: number;
  activeUsers7d: number;
  totalApiCostUsd30d: number;
  avgCostPerDesignUsd30d: number | null;
  systemPromptScoreWeighted: number | null;
  globalCacheHitRate: number | null;
  dailyActiveUsersLast30d: Array<{ date: string; activeUsers: number }>;
  dailyDesignVolumeByPlatformLast30d: Array<{ date: string; platform: string; count: number }>;
  dailyCostTrendLast30d: Array<{ date: string; totalCostUsd: number; rolling7dAvg: number | null }>;
  /** Sprint 16 A/B testing summary for admin overview widget. */
  abTestSummary: {
    runningCount: number;
    pendingWinnerReviewCount: number;
    closestToMinSamples: { testId: string; name: string; progress: number } | null;
  };
  /** Daily avg revisions (lower often = better UX) with promotion dates for overlay chart. */
  promotionImpact: {
    series: Array<{ date: string; avgRevisions: number | null }>;
    markers: Array<{ date: string; label: string }>;
  };
  /**
   * Descriptive pre/post windows around each promotion (global traffic).
   * Not causal attribution — see `methodology` string.
   */
  promotionAttribution: {
    methodology: string;
    windows: Array<{
      promotionId: string;
      promotedAt: string;
      testName: string;
      platform: string;
      format: string;
      preWindowAvgRevisions: number | null;
      postWindowAvgRevisions: number | null;
      delta: number | null;
    }>;
  };
}> {
  await ensureDailySystemMetricTable();
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalDesignsGenerated,
    designsToday,
    activeUsers7d,
    totalApiCostUsd30d,
    avgCostPerDesignUsd30d,
    systemPromptScoreWeighted,
    globalCacheHitRate,
    dailyActiveUsersLast30d,
    dailyDesignVolumeByPlatformLast30d,
    dailyCostTrendLast30d,
    abTestSummary,
    promotionImpact,
    promotionAttribution,
  ] = await Promise.all([
    withTimeout(prisma.user.count(), 10_000),
    withTimeout(prisma.design.count(), 10_000),
    withTimeout(
      prisma.design.count({
        where: { createdAt: { gte: new Date(new Date(now).setHours(0, 0, 0, 0)) } },
      }),
      10_000
    ),
    withTimeout(
      prisma.design
        .findMany({
          where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
          select: { userId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.userId)).size),
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM(gl."costUsd"), 0)::float as "total"
        FROM "GenerationLog" gl
        WHERE gl."costUsd" IS NOT NULL
          AND gl."createdAt" >= ${since30d}
      `,
      10_000
    ).then((rows) => rows[0]?.total ?? 0),
    withTimeout(
      (async () => {
        const [cost, designs] = await Promise.all([
          prisma.$queryRaw<Array<{ total: number }>>`
            SELECT COALESCE(SUM(gl."costUsd"), 0)::float as "total"
            FROM "GenerationLog" gl
            WHERE gl."costUsd" IS NOT NULL
              AND gl."createdAt" >= ${since30d}
          `,
          prisma.design.count({
            where: { createdAt: { gte: since30d } },
          }),
        ]);
        const total = cost[0]?.total ?? 0;
        return designs ? total / designs : null;
      })(),
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ weighted: number | null }>>`
        SELECT
          CASE
            WHEN SUM(ps."totalUses") = 0 THEN NULL
            ELSE (SUM(ps."score" * ps."totalUses")::float / NULLIF(SUM(ps."totalUses"), 0))::float
          END as "weighted"
        FROM "PromptScore" ps
      `,
      10_000
    ).then((rows) => rows[0]?.weighted ?? null),
    withTimeout(
      prisma.$queryRaw<Array<{ hitRate: number | null }>>`
        WITH base AS (
          SELECT
            d.id as "designId"
          FROM "Design" d
          WHERE d."createdAt" >= ${since30d}
        )
        SELECT
          CASE
            WHEN SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0)) = 0 THEN NULL
            ELSE (SUM(COALESCE(dv."cachedTokens", 0))::float /
                 NULLIF(SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0))::float, 0)) * 100
          END as "hitRate"
        FROM base
        LEFT JOIN LATERAL (
          SELECT
            dv."promptTokens",
            dv."completionTokens",
            dv."cachedTokens"
          FROM "DesignVersion" dv
          WHERE dv."designId" = base."designId"
          ORDER BY dv."versionNumber" DESC
          LIMIT 1
        ) dv ON true
      `,
      10_000
    ).then((rows) => rows[0]?.hitRate ?? null),
    withTimeout(
      prisma.$queryRaw<Array<{ date: string; activeUsers: number }>>`
        SELECT
          to_char(m."date", 'YYYY-MM-DD') as "date",
          m."activeUsers"::int as "activeUsers"
        FROM "DailySystemMetric" m
        WHERE m."date" >= ${since30d}::date
        ORDER BY m."date" ASC
      `,
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ date: string; platform: string; count: number }>>`
        SELECT
          to_char(m."date", 'YYYY-MM-DD') as "date",
          'all'::text as "platform",
          COALESCE(m."totalDesigns", 0)::int as "count"
        FROM "DailySystemMetric" m
        WHERE m."date" >= ${since30d}::date
        ORDER BY m."date" ASC
      `,
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ date: string; totalCostUsd: number; rolling7dAvg: number | null }>>`
        WITH daily AS (
          SELECT m."date"::timestamptz as day, COALESCE(m."totalCostUsd", 0)::float as "totalCostUsd"
          FROM "DailySystemMetric" m
          WHERE m."date" >= ${since30d}::date
        )
        SELECT
          to_char(day, 'YYYY-MM-DD') as "date",
          "totalCostUsd",
          AVG("totalCostUsd") OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)::float as "rolling7dAvg"
        FROM daily
        ORDER BY day ASC
      `,
      10_000
    ),
    withTimeout(
      (async () => {
        const runningCount = await prisma.promptABTest.count({ where: { status: "running" } });
        const pendingWinnerReviewCount = await prisma.promptABTest.count({
          where: {
            status: "running",
            autoPromoteWinner: false,
            abResults: {
              some: {
                recommendedWinner: { not: null },
                sampleSufficient: true,
              },
            },
          },
        });
        const running = await prisma.promptABTest.findMany({
          where: { status: "running" },
          select: { id: true, name: true, minSamplesPerVariant: true, startDate: true },
          take: 20,
        });
        let closest: { testId: string; name: string; progress: number } | null = null;
        let best = -1;
        for (const t of running) {
          const logs = await prisma.generationLog.findMany({
            where: {
              createdAt: { gte: t.startDate },
              testAssignments: { not: Prisma.DbNull },
            },
            select: { testAssignments: true },
            take: 8000,
          });
          let n = 0;
          for (const l of logs) {
            const arr = l.testAssignments as Array<{ testId?: string }> | null;
            if (Array.isArray(arr) && arr.some((x) => x?.testId === t.id)) n += 1;
          }
          const need = t.minSamplesPerVariant * 2;
          const progress = need > 0 ? Math.min(1, n / need) : 0;
          if (progress > best) {
            best = progress;
            closest = { testId: t.id, name: t.name, progress };
          }
        }
        return {
          runningCount,
          pendingWinnerReviewCount,
          closestToMinSamples: closest,
        };
      })(),
      15_000
    ),
    withTimeout(
      (async () => {
        const seriesRows = await prisma.$queryRaw<Array<{ date: string; avgRevisions: number | null }>>`
          SELECT
            to_char(m."date", 'YYYY-MM-DD') as "date",
            m."avgRevisions"::float as "avgRevisions"
          FROM "DailySystemMetric" m
          WHERE m."date" >= ${since30d}::date
          ORDER BY m."date" ASC
        `;
        const promotions = await prisma.promotionLog.findMany({
          where: { promotedAt: { gte: since30d }, revertedAt: null },
          select: { promotedAt: true, test: { select: { name: true } } },
          orderBy: { promotedAt: "asc" },
        });
        const markers = promotions.map((p) => ({
          date: p.promotedAt.toISOString().slice(0, 10),
          label: (p.test?.name ?? "Promotion").slice(0, 36),
        }));
        return {
          series: seriesRows.map((r) => ({
            date: r.date,
            avgRevisions: r.avgRevisions == null ? null : Number(r.avgRevisions),
          })),
          markers,
        };
      })(),
      15_000
    ),
    withTimeout(
      (async () => {
        const methodology =
          "Each row compares mean revision count on all GenerationLog rows in the 7 calendar days before vs. after a promotion instant. This is a descriptive before/after window — not a causal estimate (confounders include seasonality, product changes, and traffic mix).";
        const promos = await prisma.promotionLog.findMany({
          where: { promotedAt: { gte: since90d }, revertedAt: null },
          orderBy: { promotedAt: "desc" },
          take: 12,
          include: {
            test: { select: { name: true, platform: true, format: true } },
          },
        });
        const windows: Array<{
          promotionId: string;
          promotedAt: string;
          testName: string;
          platform: string;
          format: string;
          preWindowAvgRevisions: number | null;
          postWindowAvgRevisions: number | null;
          delta: number | null;
        }> = [];
        const dayMs = 24 * 60 * 60 * 1000;
        for (const p of promos) {
          const t = p.promotedAt;
          const preStart = new Date(t.getTime() - 7 * dayMs);
          const postEnd = new Date(t.getTime() + 7 * dayMs);
          const [preAgg, postAgg] = await Promise.all([
            prisma.generationLog.aggregate({
              where: { createdAt: { gte: preStart, lt: t } },
              _avg: { revisionCount: true },
              _count: true,
            }),
            prisma.generationLog.aggregate({
              where: { createdAt: { gte: t, lt: postEnd } },
              _avg: { revisionCount: true },
              _count: true,
            }),
          ]);
          const pre = preAgg._avg.revisionCount;
          const post = postAgg._avg.revisionCount;
          const delta =
            pre != null && post != null ? Number((post - pre).toFixed(4)) : null;
          windows.push({
            promotionId: p.id,
            promotedAt: t.toISOString(),
            testName: p.test?.name ?? "—",
            platform: p.test?.platform ?? "—",
            format: p.test?.format ?? "—",
            preWindowAvgRevisions: pre != null ? Number(pre.toFixed(4)) : null,
            postWindowAvgRevisions: post != null ? Number(post.toFixed(4)) : null,
            delta,
          });
        }
        return { methodology, windows };
      })(),
      20_000
    ),
  ]);

  return {
    totalUsers,
    totalDesignsGenerated,
    designsToday,
    activeUsers7d,
    totalApiCostUsd30d,
    avgCostPerDesignUsd30d,
    systemPromptScoreWeighted,
    globalCacheHitRate,
    dailyActiveUsersLast30d,
    dailyDesignVolumeByPlatformLast30d,
    dailyCostTrendLast30d,
    abTestSummary,
    promotionImpact,
    promotionAttribution,
  };
}

