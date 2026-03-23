import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsPeriod } from "@/lib/analytics/period";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getRevisionPatternBreakdown, getRevisionRateTrend } from "@/lib/analytics/revisionRates";

export const runtime = "nodejs";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  refresh: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ period: url.searchParams.get("period") ?? undefined, refresh: url.searchParams.get("refresh") ?? undefined });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid period", 400);

    const period = (parsed.data.period ?? "30d") as AnalyticsPeriod;
    const force = parsed.data.refresh === "1" || parsed.data.refresh === "true";

    const cacheKey = `analytics:revisions:${userId}:${period}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: async () => {
        const [trend, patternBreakdown] = await Promise.all([
          getRevisionRateTrend(userId, period),
          getRevisionPatternBreakdown(userId, period),
        ]);
        return { trend, patternBreakdown };
      },
      force,
    });

    return ok({ ...res.data, cachedAt: res.cachedAt, period }, 200);
  } catch (err: any) {
    if (err instanceof AnalyticsTimeoutError || err?.code === "ANALYTICS_TIMEOUT") {
      return fail("ANALYTICS_TIMEOUT", "Analytics are taking longer than usual. Please try again in a moment.", 504);
    }
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

