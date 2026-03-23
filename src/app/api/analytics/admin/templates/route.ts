import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getAdminTemplateLeaderboard, getAdminTemplateRecommendations } from "@/lib/analytics/admin/templates";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  minUses: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdminUser();
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ minUses: url.searchParams.get("minUses") ?? undefined });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query", 400);

    const minUses = parsed.data.minUses ?? 20;
    const cacheKey = `analytics:admin:templates:${minUses}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: async () => {
        const [leaderboard, recommendations] = await Promise.all([
          getAdminTemplateLeaderboard({ minUses }),
          getAdminTemplateRecommendations(),
        ]);
        return { leaderboard, recommendations };
      },
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

