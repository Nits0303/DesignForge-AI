import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsPeriod } from "@/lib/analytics/period";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getUserAnalyticsDashboard } from "@/lib/analytics/dashboard";

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

    const cacheKey = `analytics:dashboard:${userId}:${period}`;
    const cached = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: () => getUserAnalyticsDashboard(userId, period),
      force,
    });

    return ok({ ...cached.data, cachedAt: cached.cachedAt, period }, 200);
  } catch (err: any) {
    if (err instanceof AnalyticsTimeoutError || err?.code === "ANALYTICS_TIMEOUT") {
      return fail("ANALYTICS_TIMEOUT", "Analytics are taking longer than usual. Please try again in a moment.", 504);
    }
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Forbidden", 403);
    // Avoid leaking internal details.
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

