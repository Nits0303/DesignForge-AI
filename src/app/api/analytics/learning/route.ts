import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getActivePreferenceCount, getUserQualityTrend } from "@/lib/analytics/learningEngine";

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
    const parsed = querySchema.safeParse({ period: url.searchParams.get("period") ?? undefined });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query", 400);

    const cachePeriod = parsed.data.period ?? "all";
    const force = parsed.data.refresh === "1" || parsed.data.refresh === "true";
    const cacheKey = `analytics:learning:${userId}:${cachePeriod}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: async () => {
        const [qualityTrend, activePreferenceCount, user] = await Promise.all([
          getUserQualityTrend(userId),
          getActivePreferenceCount(userId),
          prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true, firstPreferenceInferredAt: true },
          }),
        ]);

        const createdAt = user?.createdAt ?? null;
        const firstPreferenceInferredAt = user?.firstPreferenceInferredAt ?? null;
        const timeToFirstPreferenceDays =
          createdAt && firstPreferenceInferredAt
            ? (firstPreferenceInferredAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
            : null;

        return {
          qualityTrend,
          activePreferenceCount,
          timeToFirstPreferenceDays,
          firstPreferenceInferredAt,
          createdAt,
        };
      },
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

