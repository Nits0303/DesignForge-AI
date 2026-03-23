import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getLearningEngineEffectiveness } from "@/lib/analytics/learningEngine";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminUser();
    const cacheKey = "analytics:admin:learning:effectiveness";

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: async () => {
        const [effectiveness, firstPrefHistogram, globalPatterns, batchDurations] = await Promise.all([
          getLearningEngineEffectiveness(),
          prisma.$queryRaw<Array<{ bucketDays: string; userCount: number }>>`
            SELECT
              CASE
                WHEN u."firstPreferenceInferredAt" IS NULL THEN 'not_inferred'
                WHEN EXTRACT(day FROM (u."firstPreferenceInferredAt" - u."createdAt")) < 3 THEN '0-2d'
                WHEN EXTRACT(day FROM (u."firstPreferenceInferredAt" - u."createdAt")) < 7 THEN '3-6d'
                WHEN EXTRACT(day FROM (u."firstPreferenceInferredAt" - u."createdAt")) < 14 THEN '7-13d'
                ELSE '14d+'
              END as "bucketDays",
              COUNT(*)::int as "userCount"
            FROM "User" u
            GROUP BY 1
            ORDER BY 1
          `,
          prisma.revisionPattern.findMany({
            where: { userId: null },
            orderBy: { frequency: "desc" },
            take: 100,
            select: { patternType: true, frequency: true, lastSeenAt: true },
          }),
          prisma.learningBatchLog.findMany({
            where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            orderBy: { runDate: "asc" },
            take: 200,
            select: { runDate: true, durationMs: true, jobName: true, status: true },
          }),
        ]);

        return {
          ...effectiveness,
          firstPreferenceHistogram: firstPrefHistogram,
          globalRevisionPatterns: globalPatterns,
          batchDurations30d: batchDurations,
        };
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

