import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getAdminBatchAnalytics } from "@/lib/analytics/admin/batch";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminUser();
    const cacheKey = "analytics:admin:batch:default";

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: () => getAdminBatchAnalytics(),
    });

    return ok(res.data, 200);
  } catch (err: any) {
    if (err instanceof AnalyticsTimeoutError || err?.code === "ANALYTICS_TIMEOUT") {
      return fail("ANALYTICS_TIMEOUT", "Analytics are taking longer than usual. Please try again in a moment.", 504);
    }
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

