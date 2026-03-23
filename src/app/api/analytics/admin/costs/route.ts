import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getAdminCosts } from "@/lib/analytics/admin/costs";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  sinceDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdminUser();
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ sinceDays: url.searchParams.get("sinceDays") ?? undefined });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query", 400);

    const sinceDays = parsed.data.sinceDays ?? 30;
    const cacheKey = `analytics:admin:costs:${sinceDays}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: () => getAdminCosts({ sinceDays }),
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

