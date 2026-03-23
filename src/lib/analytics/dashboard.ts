import { prisma } from "@/lib/db/prisma";
import { AnalyticsPeriod, getPeriodRange, getPreviousPeriodRange } from "@/lib/analytics/period";
import { withTimeout } from "@/lib/analytics/timeout";
import { getDesignVolumeByPlatform, getTotalDesignCount } from "@/lib/analytics/designVolume";
import { getFirstAttemptApprovalRate } from "@/lib/analytics/revisionRates";
import { getActivePreferenceCount } from "@/lib/analytics/learningEngine";
import { getTokenUsageBreakdown } from "@/lib/analytics/costs";

export async function getUserAnalyticsDashboard(userId: string, period: AnalyticsPeriod) {
  const totalDesignCount = await getTotalDesignCount(userId, period);

  // Avg revisions + zero revision rate + change.
  const { start, end } = getPeriodRange(period);
  const prev = getPreviousPeriodRange(period);

  const avgRevisionsRow = await (period === "all"
    ? withTimeout(
        prisma.$queryRaw<
          Array<{
            avgRevisions: number | null;
            zeroRevisionRate: number | null;
            decidedCount: number;
          }>
        >`
          SELECT
            AVG(COALESCE(gl."revisionCount", 0))::float as "avgRevisions",
            CASE WHEN COUNT(*) = 0 THEN NULL ELSE (SUM(CASE WHEN COALESCE(gl."revisionCount", 0) = 0 THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 END as "zeroRevisionRate",
            COUNT(*)::int as "decidedCount"
          FROM "GenerationLog" gl
          WHERE gl."userId" = ${userId}
            AND gl."wasApproved" IS NOT NULL
            AND gl."createdAt" >= (NOW() - interval '90 days')
        `,
        10_000
      )
    : withTimeout(
        prisma.$queryRaw<
          Array<{
            curAvgRevisions: number | null;
            prevAvgRevisions: number | null;
            curDecidedCount: number;
            curZeroRevisionRate: number | null;
          }>
        >`
          WITH cur AS (
            SELECT
              AVG(COALESCE(gl."revisionCount", 0))::float as "curAvgRevisions",
              CASE WHEN COUNT(*) = 0 THEN NULL ELSE (SUM(CASE WHEN COALESCE(gl."revisionCount", 0) = 0 THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 END as "curZeroRevisionRate",
              COUNT(*)::int as "curDecidedCount"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${userId}
              AND gl."wasApproved" IS NOT NULL
              AND gl."createdAt" >= ${start}
              AND gl."createdAt" < ${end}
          ),
          prev AS (
            SELECT AVG(COALESCE(gl."revisionCount", 0))::float as "prevAvgRevisions"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${userId}
              AND gl."wasApproved" IS NOT NULL
              AND gl."createdAt" >= ${prev?.start}
              AND gl."createdAt" < ${prev?.end}
          )
          SELECT
            cur."curAvgRevisions" as "curAvgRevisions",
            prev."prevAvgRevisions" as "prevAvgRevisions",
            cur."curDecidedCount" as "curDecidedCount",
            cur."curZeroRevisionRate" as "curZeroRevisionRate"
          FROM cur, prev
        `,
        10_000
      ));

  const a = avgRevisionsRow[0] ?? {
    curAvgRevisions: null,
    prevAvgRevisions: null,
    curDecidedCount: 0,
    curZeroRevisionRate: null,
  };

  const avgRevisionsPerDesign =
    "curAvgRevisions" in a ? (a.curAvgRevisions ?? 0) : ((a as any).avgRevisions ?? 0);

  const zeroRevisionRate =
    "curZeroRevisionRate" in a ? (a.curZeroRevisionRate ?? null) : ((a as any).zeroRevisionRate ?? null);

  const changeFromPreviousAvgRevisions =
    period === "all" || !("prevAvgRevisions" in a)
      ? null
      : a.curAvgRevisions == null || (a as any).prevAvgRevisions == null
        ? null
        : a.curAvgRevisions - (a as any).prevAvgRevisions;

  const avgRevisionsChangePercent =
    period === "all"
      ? null
      : (a as any).prevAvgRevisions == null || (a as any).prevAvgRevisions === 0
        ? null
        : ((avgRevisionsPerDesign - (a as any).prevAvgRevisions) / (a as any).prevAvgRevisions) * 100;

  // First-attempt approval rate + change.
  const firstAttempt = await getFirstAttemptApprovalRate(userId, period);

  // Total cost + change.
  const totalCost: any = await (period === "all"
    ? withTimeout(
        prisma.$queryRaw<Array<{ totalCostUsd: number }>>`
          SELECT COALESCE(SUM(gl."costUsd"), 0)::float as "totalCostUsd"
          FROM "GenerationLog" gl
          WHERE gl."userId" = ${userId}
            AND gl."costUsd" IS NOT NULL
        `,
        10_000
      )
    : withTimeout(
        prisma.$queryRaw<Array<{ curCost: number; prevCost: number }>>`
          WITH cur AS (
            SELECT COALESCE(SUM(gl."costUsd"), 0)::float as "curCost"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${userId}
              AND gl."costUsd" IS NOT NULL
              AND gl."createdAt" >= ${start}
              AND gl."createdAt" < ${end}
          ),
          prev AS (
            SELECT COALESCE(SUM(gl."costUsd"), 0)::float as "prevCost"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${userId}
              AND gl."costUsd" IS NOT NULL
              AND gl."createdAt" >= ${prev?.start}
              AND gl."createdAt" < ${prev?.end}
          )
          SELECT cur."curCost" as "curCost", prev."prevCost" as "prevCost"
          FROM cur, prev
        `,
        10_000
      ));

  const curCostUsd = period === "all" ? totalCost[0]?.totalCostUsd ?? 0 : totalCost[0]?.curCost ?? 0;
  const prevCostUsd = period === "all" ? null : totalCost[0]?.prevCost ?? null;

  const costChangeFromPreviousPeriod =
    prevCostUsd == null ? null : curCostUsd - prevCostUsd;
  const costChangePercent =
    prevCostUsd == null || prevCostUsd === 0 ? null : (costChangeFromPreviousPeriod! / prevCostUsd) * 100;

  // Cache hit rate (tokens cached / total tokens) for designs created in the period.
  const cacheHit = await (period === "all"
    ? withTimeout(
        prisma.$queryRaw<Array<{ cacheHitRate: number | null }>>`
          SELECT
            CASE
              WHEN SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0)) = 0 THEN NULL
              ELSE (SUM(COALESCE(dv."cachedTokens", 0))::float /
                   NULLIF(SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0))::float, 0)) * 100
            END as "cacheHitRate"
          FROM "Design" d
          LEFT JOIN LATERAL (
            SELECT
              dv."promptTokens",
              dv."completionTokens",
              dv."cachedTokens"
            FROM "DesignVersion" dv
            WHERE dv."designId" = d.id
            ORDER BY dv."versionNumber" DESC
            LIMIT 1
          ) dv ON true
          WHERE d."userId" = ${userId}
            AND d."createdAt" >= (NOW() - interval '90 days')
        `,
        10_000
      )
    : withTimeout(
        prisma.$queryRaw<Array<{ cacheHitRate: number | null }>>`
          SELECT
            CASE
              WHEN SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0)) = 0 THEN NULL
              ELSE (SUM(COALESCE(dv."cachedTokens", 0))::float /
                   NULLIF(SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0))::float, 0)) * 100
            END as "cacheHitRate"
          FROM "Design" d
          LEFT JOIN LATERAL (
            SELECT
              dv."promptTokens",
              dv."completionTokens",
              dv."cachedTokens"
            FROM "DesignVersion" dv
            WHERE dv."designId" = d.id
            ORDER BY dv."versionNumber" DESC
            LIMIT 1
          ) dv ON true
          WHERE d."userId" = ${userId}
            AND d."createdAt" >= ${start}
            AND d."createdAt" < ${end}
        `,
        10_000
      ));

  const cacheHitRate = cacheHit[0]?.cacheHitRate ?? null;

  const activePreferenceCount = await getActivePreferenceCount(userId);
  const tokenBreakdown = await getTokenUsageBreakdown(userId, period);

  const platforms = await getDesignVolumeByPlatform(userId, period);
  const topPlatform = platforms[0] ? platforms[0].platform : "unknown";

  // Batch usage in the same period as "Design createdAt".
  const batchRow = await (period === "all"
    ? withTimeout(
        prisma.$queryRaw<Array<{ batchCount: number }>>`
          SELECT COUNT(*)::int as "batchCount"
          FROM "BatchItem" bi
          JOIN "BatchJob" bj ON bj.id = bi."batchJobId"
          WHERE bj."userId" = ${userId}
            AND bi.status IN ('approved','complete')
            AND bi."createdAt" >= (NOW() - interval '90 days')
        `,
        10_000
      )
    : withTimeout(
        prisma.$queryRaw<Array<{ batchCount: number }>>`
          SELECT COUNT(*)::int as "batchCount"
          FROM "BatchItem" bi
          JOIN "BatchJob" bj ON bj.id = bi."batchJobId"
          WHERE bj."userId" = ${userId}
            AND bi.status IN ('approved','complete')
            AND bi."createdAt" >= ${start}
            AND bi."createdAt" < ${end}
        `,
        10_000
      ));

  const designsViaBatchCount = batchRow[0]?.batchCount ?? 0;
  const batchDesignPercentage = totalDesignCount.total ? (designsViaBatchCount / totalDesignCount.total) * 100 : null;

  const batchApiSavings = await (period === "all"
    ? withTimeout(
        prisma.$queryRaw<Array<{ total: number }>>`
          SELECT COALESCE(SUM((bj."estimatedCostUsd" - bj."actualCostUsd")::float), 0)::float as "total"
          FROM "BatchJob" bj
          WHERE bj."userId" = ${userId}
            AND bj."processingStrategy" = 'anthropic_batch'
            AND bj."estimatedCostUsd" IS NOT NULL
            AND bj."actualCostUsd" IS NOT NULL
        `,
        10_000
      )
    : withTimeout(
        prisma.$queryRaw<Array<{ total: number }>>`
          SELECT COALESCE(SUM((bj."estimatedCostUsd" - bj."actualCostUsd")::float), 0)::float as "total"
          FROM "BatchJob" bj
          WHERE bj."userId" = ${userId}
            AND bj."processingStrategy" = 'anthropic_batch'
            AND bj."estimatedCostUsd" IS NOT NULL
            AND bj."actualCostUsd" IS NOT NULL
            AND bj."createdAt" >= ${start}
            AND bj."createdAt" < ${end}
        `,
        10_000
      ));

  return {
    totalDesigns: totalDesignCount.total,
    totalDesignsChangeFromPreviousPeriod: totalDesignCount.changeFromPreviousPeriod,
    totalDesignsChangePercent: totalDesignCount.changePercent,

    avgRevisionsPerDesign,
    avgRevisionsPerDesignChangeFromPreviousPeriod: period === "all" ? null : changeFromPreviousAvgRevisions,
    avgRevisionsPerDesignChangePercent: period === "all" ? null : avgRevisionsChangePercent,

    firstAttemptApprovalRate: firstAttempt.rate,
    firstAttemptApprovalChangeFromPreviousPeriod: firstAttempt.changeFromPreviousPeriod,

    zeroRevisionRate,
    totalCostUsd: curCostUsd,
    totalCostChangeFromPreviousPeriod: costChangeFromPreviousPeriod,
    totalCostChangePercent: costChangePercent,

    cacheHitRate,
    activeLearnedPreferences: activePreferenceCount,
    designsViaBatchCount,
    designsViaBatchPercentage: batchDesignPercentage,
    mostUsedPlatform: topPlatform,
    estimatedSavingsFromCaching: tokenBreakdown.estimatedSavingsFromCaching,
    batchApiSavings: Number(batchApiSavings?.[0]?.total ?? 0),
  };
}

