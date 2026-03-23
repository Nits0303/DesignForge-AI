import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getCumulativeCost } from "@/lib/analytics/costs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;

    const url = new URL(req.url);
    const refresh = url.searchParams.get("refresh");
    const force = refresh === "1" || refresh === "true";

    const cacheKey = `analytics:costs-summary:${userId}:all`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: () => getCumulativeCost(userId),
      force,
    });

    return ok({ ...res.data, cachedAt: res.cachedAt }, 200);
  } catch (err: any) {
    if (err instanceof AnalyticsTimeoutError || err?.code === "ANALYTICS_TIMEOUT") {
      return fail("ANALYTICS_TIMEOUT", "Analytics are taking longer than usual. Please try again in a moment.", 504);
    }
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

