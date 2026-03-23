import { prisma } from "@/lib/db/prisma";
import { AnalyticsPeriod, getPreviousPeriodRange, getPeriodRange } from "@/lib/analytics/period";
import { withTimeout } from "@/lib/analytics/timeout";

export type RevisionRateTrendRow = {
  weekStart: string;
  avgRevisions: number;
  zeroRevisionRate: number | null;
  designCount: number;
};

export async function getRevisionRateTrend(
  userId: string,
  period: AnalyticsPeriod
): Promise<RevisionRateTrendRow[]> {
  const { start, end } = getPeriodRange(period);
  if (!start) {
    // "all" - only compute last 90d trend to keep it readable.
    const fallbackStart = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    return getRevisionRateTrendInternal(userId, fallbackStart, end);
  }

  return getRevisionRateTrendInternal(userId, start, end);
}

async function getRevisionRateTrendInternal(
  userId: string,
  start: Date,
  end: Date
): Promise<RevisionRateTrendRow[]> {
  return withTimeout(
    prisma.$queryRaw<RevisionRateTrendRow[]>`
      SELECT
        to_char(date_trunc('week', gl."createdAt"), 'YYYY-MM-DD') as "weekStart",
        AVG(COALESCE(gl."revisionCount", 0))::float as "avgRevisions",
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE (SUM(CASE WHEN COALESCE(gl."revisionCount", 0) = 0 THEN 1 ELSE 0 END)::float / COUNT(*)) * 100
        END as "zeroRevisionRate",
        COUNT(*)::int as "designCount"
      FROM "GenerationLog" gl
      WHERE gl."userId" = ${userId}
        AND gl."wasApproved" IS NOT NULL
        AND gl."createdAt" >= ${start}
        AND gl."createdAt" < ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    10_000
  );
}

export type RevisionPatternBreakdownRow = {
  patternType: string;
  count: number;
  percentage: number;
};

export async function getRevisionPatternBreakdown(
  userId: string,
  period: AnalyticsPeriod
): Promise<RevisionPatternBreakdownRow[]> {
  const { start, end } = getPeriodRange(period);

  if (!start) {
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ patternType: string; count: number; percentage: number }>>`
        SELECT
          rp."patternType" as "patternType",
          SUM(COALESCE(rp."frequency", 0))::int as "count",
          (SUM(COALESCE(rp."frequency", 0))::float / NULLIF(SUM(SUM(COALESCE(rp."frequency", 0))) OVER (), 0)) * 100 as "percentage"
        FROM "RevisionPattern" rp
        WHERE rp."userId" = ${userId}
        GROUP BY 1
        ORDER BY "count" DESC
      `,
      10_000
    );
    return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
  }

  const rows = await withTimeout(
    prisma.$queryRaw<Array<{ patternType: string; count: number; percentage: number }>>`
      SELECT
        rp."patternType" as "patternType",
        SUM(COALESCE(rp."frequency", 0))::int as "count",
        (SUM(COALESCE(rp."frequency", 0))::float / NULLIF(SUM(SUM(COALESCE(rp."frequency", 0))) OVER (), 0)) * 100 as "percentage"
      FROM "RevisionPattern" rp
      WHERE rp."userId" = ${userId}
        AND rp."lastSeenAt" >= ${start}
        AND rp."lastSeenAt" < ${end}
      GROUP BY 1
      ORDER BY "count" DESC
    `,
    10_000
  );
  return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
}

export type FirstAttemptApprovalRateRow = {
  rate: number | null;
  changeFromPreviousPeriod: number | null;
};

function computeFirstAttemptRateSql(userId: string, start: Date, end: Date) {
  return prisma.$queryRaw<
    Array<{ rate: number | null; decidedCount: number }>
  >`
    SELECT
      CASE
        WHEN decided."decidedCount" = 0 THEN NULL
        ELSE (decided."firstAttemptApproved"::float / decided."decidedCount"::float) * 100
      END as "rate",
      decided."decidedCount"::int as "decidedCount"
    FROM (
      SELECT
        SUM(CASE WHEN gl."wasApproved" = true AND COALESCE(gl."revisionCount", 0) = 0 THEN 1 ELSE 0 END) as "firstAttemptApproved",
        SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END) as "decidedCount"
      FROM "GenerationLog" gl
      WHERE gl."userId" = ${userId}
        AND gl."wasApproved" IS NOT NULL
        AND gl."createdAt" >= ${start}
        AND gl."createdAt" < ${end}
    ) decided
  `;
}

export async function getFirstAttemptApprovalRate(
  userId: string,
  period: AnalyticsPeriod
): Promise<FirstAttemptApprovalRateRow> {
  if (period === "all") {
    // For "all-time", change is not meaningful.
    const { start, end } = getPeriodRange("90d"); // keep the computation bounded
    if (!start) return { rate: null, changeFromPreviousPeriod: null };
    const rows = await withTimeout(computeFirstAttemptRateSql(userId, start, end), 10_000);
    const r = rows[0]?.rate ?? null;
    return { rate: r == null ? null : Number(r), changeFromPreviousPeriod: null };
  }

  const { start: curStart, end: curEnd } = getPeriodRange(period);
  const prev = getPreviousPeriodRange(period);
  if (!curStart || !prev?.start) return { rate: null, changeFromPreviousPeriod: null };

  const [curRows, prevRows] = await Promise.all([
    withTimeout(computeFirstAttemptRateSql(userId, curStart, curEnd), 10_000),
    withTimeout(computeFirstAttemptRateSql(userId, prev.start, prev.end), 10_000),
  ]);

  const curRate = curRows[0]?.rate ?? null;
  const prevRate = prevRows[0]?.rate ?? null;

  if (curRate == null || prevRate == null) {
    return { rate: curRate == null ? null : Number(curRate), changeFromPreviousPeriod: null };
  }

  return {
    rate: Number(curRate),
    changeFromPreviousPeriod: Number(curRate - prevRate),
  };
}

