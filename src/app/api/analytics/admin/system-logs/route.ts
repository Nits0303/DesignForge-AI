import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getAdminSystemLogs } from "@/lib/analytics/admin/systemLogs";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdminUser();
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query", 400);

    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 20;
    const cacheKey = `analytics:admin:system-logs:${page}:${pageSize}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: () => getAdminSystemLogs({ page, pageSize }),
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

