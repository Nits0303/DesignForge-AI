import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsPeriod } from "@/lib/analytics/period";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { prisma } from "@/lib/db/prisma";
import { getPeriodRange } from "@/lib/analytics/period";
import { withTimeout } from "@/lib/analytics/timeout";
import { getDesignVolumeByFormat, getDesignVolumeByPlatform } from "@/lib/analytics/designVolume";

export const runtime = "nodejs";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  groupBy: z.enum(["day", "week", "platform", "format"]).optional(),
  platform: z.string().optional(),
  refresh: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      period: url.searchParams.get("period") ?? undefined,
      groupBy: url.searchParams.get("groupBy") ?? undefined,
      platform: url.searchParams.get("platform") ?? undefined,
      refresh: url.searchParams.get("refresh") ?? undefined,
    });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query", 400);

    const period = (parsed.data.period ?? "30d") as AnalyticsPeriod;
    const groupBy = parsed.data.groupBy ?? "day";
    const platform = parsed.data.platform;
    const force = parsed.data.refresh === "1" || parsed.data.refresh === "true";

    const queryName =
      groupBy === "format" ? `format:${platform ?? "unknown"}` : groupBy === "platform" ? "platform" : groupBy;
    const cacheKey = `analytics:designs:${queryName}:${userId}:${period}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: async () => {
        if (groupBy === "platform") {
          return getDesignVolumeByPlatform(userId, period);
        }
        if (groupBy === "format") {
          if (!platform) return [];
          return getDesignVolumeByFormat(userId, platform, period);
        }

        const { start, end } = getPeriodRange(period);
        const rangeDays =
          start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 3650;
        const unit: "day" | "week" | "month" =
          rangeDays > 180 ? "month" : rangeDays > 60 ? "week" : groupBy === "week" ? "week" : "day";

        if (unit === "day" && start) {
          return withTimeout(
            prisma.$queryRaw<Array<{ date: string; count: number; platform: string }>>`
              SELECT
                to_char(date_trunc('day', d."createdAt"), 'YYYY-MM-DD') as "date",
                COUNT(*)::int as "count",
                COALESCE(d.platform::text, 'unknown') as "platform"
              FROM "Design" d
              WHERE d."userId" = ${userId}
                AND d."createdAt" >= ${start}
                AND d."createdAt" < ${end}
              GROUP BY 1, 3
              ORDER BY 1 ASC, 3 ASC
            `,
            10_000
          );
        }

        if (unit === "week" && start) {
          return withTimeout(
            prisma.$queryRaw<Array<{ date: string; count: number; platform: string }>>`
              SELECT
                to_char(date_trunc('week', d."createdAt"), 'YYYY-MM-DD') as "date",
                COUNT(*)::int as "count",
                COALESCE(d.platform::text, 'unknown') as "platform"
              FROM "Design" d
              WHERE d."userId" = ${userId}
                AND d."createdAt" >= ${start}
                AND d."createdAt" < ${end}
              GROUP BY 1, 3
              ORDER BY 1 ASC, 3 ASC
            `,
            10_000
          );
        }

        if (unit === "month" && start) {
          return withTimeout(
            prisma.$queryRaw<Array<{ date: string; count: number; platform: string }>>`
              SELECT
                to_char(date_trunc('month', d."createdAt"), 'YYYY-MM-DD') as "date",
                COUNT(*)::int as "count",
                COALESCE(d.platform::text, 'unknown') as "platform"
              FROM "Design" d
              WHERE d."userId" = ${userId}
                AND d."createdAt" >= ${start}
                AND d."createdAt" < ${end}
              GROUP BY 1, 3
              ORDER BY 1 ASC, 3 ASC
            `,
            10_000
          );
        }

        return withTimeout(
          prisma.$queryRaw<Array<{ date: string; count: number; platform: string }>>`
            SELECT
              to_char(date_trunc('week', d."createdAt"), 'YYYY-MM-DD') as "date",
              COUNT(*)::int as "count",
              COALESCE(d.platform::text, 'unknown') as "platform"
            FROM "Design" d
            WHERE d."userId" = ${userId}
            GROUP BY 1, 3
            ORDER BY 1 ASC, 3 ASC
          `,
          10_000
        );
      },
      force,
    });

    return ok({ ...res.data, cachedAt: res.cachedAt, period, groupBy }, 200);
  } catch (err: any) {
    if (err instanceof AnalyticsTimeoutError || err?.code === "ANALYTICS_TIMEOUT") {
      return fail("ANALYTICS_TIMEOUT", "Analytics are taking longer than usual. Please try again in a moment.", 504);
    }
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Forbidden", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

