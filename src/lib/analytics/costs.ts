import { prisma } from "@/lib/db/prisma";
import { AnalyticsPeriod, getPeriodRange } from "@/lib/analytics/period";
import { withTimeout } from "@/lib/analytics/timeout";

export type CostByDayRow = {
  date: string;
  costUsd: number;
  model: string;
};

export async function getCostByDay(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CostByDayRow[]> {
  return withTimeout(
    prisma.$queryRaw<CostByDayRow[]>`
      SELECT
        to_char(date_trunc('day', gl."createdAt"), 'YYYY-MM-DD') as "date",
        SUM(COALESCE(gl."costUsd", 0))::float as "costUsd",
        COALESCE(gl."model"::text, 'unknown') as "model"
      FROM "GenerationLog" gl
      WHERE gl."userId" = ${userId}
        AND gl."createdAt" >= ${startDate}
        AND gl."createdAt" < ${endDate}
        AND gl."costUsd" IS NOT NULL
      GROUP BY 1, 3
      ORDER BY 1 ASC, 3 ASC
    `,
    10_000
  );
}

export type CostByPlatformRow = {
  platform: string;
  count: number;
  costUsd: number;
  percentage: number;
};

export async function getCostByPlatform(userId: string, period: AnalyticsPeriod): Promise<CostByPlatformRow[]> {
  const { start, end } = getPeriodRange(period);
  if (!start) {
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ platform: string; count: number; costUsd: number; percentage: number }>>`
        SELECT
          COALESCE(gl."platform"::text, 'unknown') as "platform",
          COUNT(*)::int as "count",
          SUM(gl."costUsd")::float as "costUsd",
          (SUM(gl."costUsd")::float / NULLIF(SUM(SUM(gl."costUsd")) OVER (), 0)) * 100 as "percentage"
        FROM "GenerationLog" gl
        WHERE gl."userId" = ${userId}
          AND gl."costUsd" IS NOT NULL
        GROUP BY 1
        ORDER BY "costUsd" DESC
      `,
      10_000
    );
    return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
  }

  const rows = await withTimeout(
    prisma.$queryRaw<Array<{ platform: string; count: number; costUsd: number; percentage: number }>>`
      SELECT
        COALESCE(gl."platform"::text, 'unknown') as "platform",
        COUNT(*)::int as "count",
        SUM(gl."costUsd")::float as "costUsd",
        (SUM(gl."costUsd")::float / NULLIF(SUM(SUM(gl."costUsd")) OVER (), 0)) * 100 as "percentage"
      FROM "GenerationLog" gl
      WHERE gl."userId" = ${userId}
        AND gl."costUsd" IS NOT NULL
        AND gl."createdAt" >= ${start}
        AND gl."createdAt" < ${end}
      GROUP BY 1
      ORDER BY "costUsd" DESC
    `,
    10_000
  );

  return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
}

export type CostByModelRow = {
  model: string;
  totalCostUsd: number;
  totalTokens: number;
  avgCostPerDesign: number;
};

export async function getCostByModel(userId: string, period: AnalyticsPeriod): Promise<CostByModelRow[]> {
  const { start, end } = getPeriodRange(period);

  // Prisma doesn't allow conditional raw fragments with this syntax cleanly; so we just branch.
  const rows = !start
    ? await withTimeout(
        prisma.$queryRaw<Array<{ model: string; totalCostUsd: number; totalTokens: number; avgCostPerDesign: number }>>`
          SELECT
            COALESCE(gl."model"::text, 'unknown') as "model",
            SUM(gl."costUsd")::float as "totalCostUsd",
            SUM(COALESCE(gl."totalTokens", 0))::int as "totalTokens",
            (SUM(gl."costUsd")::float / NULLIF(COUNT(DISTINCT gl."designId"), 0))::float as "avgCostPerDesign"
          FROM "GenerationLog" gl
          WHERE gl."userId" = ${userId}
            AND gl."costUsd" IS NOT NULL
          GROUP BY 1
          ORDER BY "totalCostUsd" DESC
        `,
        10_000
      )
    : await withTimeout(
        prisma.$queryRaw<Array<{ model: string; totalCostUsd: number; totalTokens: number; avgCostPerDesign: number }>>`
          SELECT
            COALESCE(gl."model"::text, 'unknown') as "model",
            SUM(gl."costUsd")::float as "totalCostUsd",
            SUM(COALESCE(gl."totalTokens", 0))::int as "totalTokens",
            (SUM(gl."costUsd")::float / NULLIF(COUNT(DISTINCT gl."designId"), 0))::float as "avgCostPerDesign"
          FROM "GenerationLog" gl
          WHERE gl."userId" = ${userId}
            AND gl."costUsd" IS NOT NULL
            AND gl."createdAt" >= ${start}
            AND gl."createdAt" < ${end}
          GROUP BY 1
          ORDER BY "totalCostUsd" DESC
        `,
        10_000
      );

  return rows.map((r) => ({
    model: r.model,
    totalCostUsd: Number(r.totalCostUsd ?? 0),
    totalTokens: Number(r.totalTokens ?? 0),
    avgCostPerDesign: Number(r.avgCostPerDesign ?? 0),
  }));
}

export type TokenUsageBreakdownRow = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number | null;
  cacheHitRate: number | null;
  estimatedSavingsFromCaching: number;
};

// Approximation:
// - tokens come from the latest DesignVersion for each designId
// - costs come from GenerationLog records in the period
export async function getTokenUsageBreakdown(
  userId: string,
  period: AnalyticsPeriod
): Promise<TokenUsageBreakdownRow> {
  const { start, end } = getPeriodRange(period);
  if (!start) {
    // Keep it bounded for "all-time".
    const fallbackStart = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    return getTokenUsageBreakdown(userId, "90d").catch(() => ({
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
      totalTokens: null,
      cacheHitRate: null,
      estimatedSavingsFromCaching: 0,
    }));
  }

  const rows = await withTimeout(
    prisma.$queryRaw<
      Array<{
        inputTokens: number | null;
        outputTokens: number | null;
        cachedTokens: number | null;
        totalTokens: number | null;
        cacheHitRate: number | null;
        estimatedSavingsFromCaching: number | null;
      }>
    >`
      WITH gen AS (
        SELECT
          gl."designId" as "designId",
          gl."estimatedCostUsd" as "estimatedCostUsd",
          gl."costUsd" as "costUsd"
        FROM "GenerationLog" gl
        WHERE gl."userId" = ${userId}
          AND gl."createdAt" >= ${start}
          AND gl."createdAt" < ${end}
          AND gl."designId" IS NOT NULL
      )
      SELECT
        SUM(COALESCE(dv."promptTokens", 0))::int as "inputTokens",
        SUM(COALESCE(dv."completionTokens", 0))::int as "outputTokens",
        SUM(COALESCE(dv."cachedTokens", 0))::int as "cachedTokens",
        SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0))::int as "totalTokens",
        CASE
          WHEN SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0)) = 0 THEN NULL
          ELSE (SUM(COALESCE(dv."cachedTokens", 0))::float / NULLIF(SUM(COALESCE(dv."promptTokens", 0) + COALESCE(dv."completionTokens", 0))::float, 0)) * 100
        END as "cacheHitRate",
        (SUM(COALESCE(gen."estimatedCostUsd", 0)) - SUM(COALESCE(gen."costUsd", 0)))::float as "estimatedSavingsFromCaching"
      FROM gen
      LEFT JOIN LATERAL (
        SELECT
          dv."promptTokens",
          dv."completionTokens",
          dv."cachedTokens"
        FROM "DesignVersion" dv
        WHERE dv."designId" = gen."designId"
        ORDER BY dv."versionNumber" DESC
        LIMIT 1
      ) dv ON true
    `,
    10_000
  );

  const r = rows[0];
  return {
    inputTokens: r?.inputTokens == null ? null : Number(r.inputTokens),
    outputTokens: r?.outputTokens == null ? null : Number(r.outputTokens),
    cachedTokens: r?.cachedTokens == null ? null : Number(r.cachedTokens),
    totalTokens: r?.totalTokens == null ? null : Number(r.totalTokens),
    cacheHitRate: r?.cacheHitRate == null ? null : Number(r.cacheHitRate),
    estimatedSavingsFromCaching: Number(r?.estimatedSavingsFromCaching ?? 0),
  };
}

export async function getCumulativeCost(userId: string): Promise<{
  lifetimeCostUsd: number;
  currentMonthCostUsd: number;
  projectedMonthEndCostUsd: number | null;
}> {
  const rows = await withTimeout(
    prisma.$queryRaw<
      Array<{
        lifetimeCostUsd: number;
        currentMonthCostUsd: number;
        projectedMonthEndCostUsd: number | null;
      }>
    >`
      WITH base AS (
        SELECT
          gl."costUsd" as "costUsd",
          gl."createdAt" as "createdAt"
        FROM "GenerationLog" gl
        WHERE gl."userId" = ${userId}
          AND gl."costUsd" IS NOT NULL
      ),
      now_month_start AS (
        SELECT date_trunc('month', NOW()) as "monthStart"
      ),
      month_day_fraction AS (
        SELECT
          EXTRACT(day FROM NOW())::float /
          NULLIF(EXTRACT(day FROM (date_trunc('month', NOW()) + interval '1 month - 1 day'))::float, 0) as "dayFraction"
      )
      SELECT
        COALESCE(SUM(base."costUsd"), 0)::float as "lifetimeCostUsd",
        COALESCE(SUM(CASE WHEN base."createdAt" >= (SELECT "monthStart" FROM now_month_start) THEN base."costUsd" ELSE 0 END), 0)::float as "currentMonthCostUsd",
        CASE
          WHEN (SELECT "dayFraction" FROM month_day_fraction) IS NULL THEN NULL
          ELSE COALESCE(SUM(CASE WHEN base."createdAt" >= (SELECT "monthStart" FROM now_month_start) THEN base."costUsd" ELSE 0 END), 0)::float /
               NULLIF((SELECT "dayFraction" FROM month_day_fraction)::float, 0)
        END as "projectedMonthEndCostUsd"
      FROM base
    `,
    10_000
  );

  const r = rows[0] ?? { lifetimeCostUsd: 0, currentMonthCostUsd: 0, projectedMonthEndCostUsd: null };
  return {
    lifetimeCostUsd: Number(r.lifetimeCostUsd ?? 0),
    currentMonthCostUsd: Number(r.currentMonthCostUsd ?? 0),
    projectedMonthEndCostUsd: r.projectedMonthEndCostUsd == null ? null : Number(r.projectedMonthEndCostUsd),
  };
}

