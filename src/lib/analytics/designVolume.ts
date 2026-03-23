import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";
import { AnalyticsPeriod, getPreviousPeriodRange, getPeriodRange } from "@/lib/analytics/period";

export type DesignVolumeByPlatformRow = {
  platform: string;
  count: number;
  percentage: number;
};

export type DesignVolumeByDayRow = {
  date: string;
  count: number;
  platform: string;
};

export type DesignVolumeByFormatRow = {
  format: string;
  count: number;
  percentage: number;
};

export async function getDesignVolumeByDay(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<DesignVolumeByDayRow[]> {
  return withTimeout(
    prisma.$queryRaw<DesignVolumeByDayRow[]>`
      SELECT
        to_char(date_trunc('day', d."createdAt"), 'YYYY-MM-DD') as "date",
        COUNT(*)::int as "count",
        COALESCE(d.platform::text, 'unknown') as "platform"
      FROM "Design" d
      WHERE d."userId" = ${userId}
        AND d."createdAt" >= ${startDate}
        AND d."createdAt" < ${endDate}
      GROUP BY 1, 3
      ORDER BY 1 ASC, 3 ASC
    `,
    10_000
  );
}

export async function getDesignVolumeByPlatform(
  userId: string,
  period: AnalyticsPeriod
): Promise<DesignVolumeByPlatformRow[]> {
  const { start, end } = getPeriodRange(period);
  if (!start) {
    // all-time uses "no date filter" to keep it fast.
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ platform: string; count: number; percentage: number }>>`
        SELECT
          COALESCE(d.platform::text, 'unknown') as "platform",
          COUNT(*)::int as "count",
          (COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100 as "percentage"
        FROM "Design" d
        WHERE d."userId" = ${userId}
        GROUP BY 1
        ORDER BY "count" DESC
      `,
      10_000
    );
    return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
  }

  const rows = await withTimeout(
    prisma.$queryRaw<Array<{ platform: string; count: number; percentage: number }>>`
      SELECT
        COALESCE(d.platform::text, 'unknown') as "platform",
        COUNT(*)::int as "count",
        (COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100 as "percentage"
      FROM "Design" d
      WHERE d."userId" = ${userId}
        AND d."createdAt" >= ${start}
        AND d."createdAt" < ${end}
      GROUP BY 1
      ORDER BY "count" DESC
    `,
    10_000
  );

  return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
}

export async function getDesignVolumeByFormat(
  userId: string,
  platform: string,
  period: AnalyticsPeriod
): Promise<DesignVolumeByFormatRow[]> {
  const { start, end } = getPeriodRange(period);
  if (!start) {
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ format: string; count: number; percentage: number }>>`
        SELECT
          COALESCE(d.format::text, 'unknown') as "format",
          COUNT(*)::int as "count",
          (COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100 as "percentage"
        FROM "Design" d
        WHERE d."userId" = ${userId}
          AND d."platform" = ${platform}
        GROUP BY 1
        ORDER BY "count" DESC
      `,
      10_000
    );
    return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
  }

  const rows = await withTimeout(
    prisma.$queryRaw<Array<{ format: string; count: number; percentage: number }>>`
      SELECT
        COALESCE(d.format::text, 'unknown') as "format",
        COUNT(*)::int as "count",
        (COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100 as "percentage"
      FROM "Design" d
      WHERE d."userId" = ${userId}
        AND d."platform" = ${platform}
        AND d."createdAt" >= ${start}
        AND d."createdAt" < ${end}
      GROUP BY 1
      ORDER BY "count" DESC
    `,
    10_000
  );
  return rows.map((r) => ({ ...r, percentage: Number(r.percentage) }));
}

export type TotalDesignCountRow = {
  total: number;
  changeFromPreviousPeriod: number | null;
  changePercent: number | null;
};

export async function getTotalDesignCount(userId: string, period: AnalyticsPeriod): Promise<TotalDesignCountRow> {
  if (period === "all") {
    const total = await withTimeout(
      prisma.design.count({
        where: { userId },
      }),
      10_000
    );
    return { total, changeFromPreviousPeriod: null, changePercent: null };
  }

  const { start: curStart, end: curEnd } = getPeriodRange(period);
  const prev = getPreviousPeriodRange(period);
  if (!curStart || !prev?.start) return { total: 0, changeFromPreviousPeriod: null, changePercent: null };

  const row = await withTimeout<
    Array<{ total: number; changeFromPreviousPeriod: number | null; changePercent: number | null }>
  >(
    prisma.$queryRaw`
      WITH current AS (
        SELECT COUNT(*)::int as total
        FROM "Design" d
        WHERE d."userId" = ${userId}
          AND d."createdAt" >= ${curStart}
          AND d."createdAt" < ${curEnd}
      ),
      previous AS (
        SELECT COUNT(*)::int as total
        FROM "Design" d
        WHERE d."userId" = ${userId}
          AND d."createdAt" >= ${prev.start}
          AND d."createdAt" < ${prev.end}
      )
      SELECT
        current.total,
        (current.total - previous.total) as "changeFromPreviousPeriod",
        CASE
          WHEN previous.total = 0 THEN NULL
          ELSE ((current.total - previous.total)::float / previous.total::float) * 100
        END as "changePercent"
      FROM current, previous
    `,
    10_000
  );

  const r = row[0] ?? { total: 0, changeFromPreviousPeriod: null, changePercent: null };
  return {
    total: Number(r.total ?? 0),
    changeFromPreviousPeriod: r.changeFromPreviousPeriod == null ? null : Number(r.changeFromPreviousPeriod),
    changePercent: r.changePercent == null ? null : Number(r.changePercent),
  };
}

