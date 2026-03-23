import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";

export type AdminCostByModelRow = { model: string; totalCostUsd: number; totalTokens: number; avgCostPerDesign: number };
export type AdminCostByPlatformRow = { platform: string; totalCostUsd: number; totalTokens: number; avgCostPerDesign: number };
export type AdminCohortCostRow = { cohort: "new" | "returning"; totalCostUsd: number; designs: number; avgCostPerDesign: number };

export type AdminPromptCachingSavings = {
  totalTokensCacheHits: number;
  estimatedCostWithoutCachingUsd: number;
  actualCostUsd: number;
  savingsUsd: number;
  savingsPercent: number | null;
};

export type AdminCostsPayload = {
  byModel: AdminCostByModelRow[];
  byPlatform: AdminCostByPlatformRow[];
  byCohort: AdminCohortCostRow[];
  promptCachingSavings: AdminPromptCachingSavings;
  top10ExpensiveCalls: Array<{ id: string; userId: string | null; model: string; platform: string | null; costUsd: number; estimatedCostUsd: number | null; createdAt: string }>;
};

export async function getAdminCosts(payload: { sinceDays?: number } = {}): Promise<AdminCostsPayload> {
  const sinceDays = payload.sinceDays ?? 30;
  const now = new Date();
  const since = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000);

  const [byModel, byPlatform, byCohort, savings, top10] = await Promise.all([
    withTimeout(
      prisma.$queryRaw<Array<{ model: string; totalCostUsd: number; totalTokens: number; avgCostPerDesign: number }>>`
        SELECT
          COALESCE(gl."model"::text, 'unknown') as "model",
          SUM(gl."costUsd")::float as "totalCostUsd",
          SUM(COALESCE(gl."totalTokens", 0))::int as "totalTokens",
          (SUM(gl."costUsd")::float / NULLIF(COUNT(DISTINCT gl."designId"), 0))::float as "avgCostPerDesign"
        FROM "GenerationLog" gl
        WHERE gl."costUsd" IS NOT NULL
          AND gl."createdAt" >= ${since}
        GROUP BY 1
        ORDER BY "totalCostUsd" DESC
      `,
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ platform: string; totalCostUsd: number; totalTokens: number; avgCostPerDesign: number }>>`
        SELECT
          COALESCE(gl."platform"::text, 'unknown') as "platform",
          SUM(gl."costUsd")::float as "totalCostUsd",
          SUM(COALESCE(gl."totalTokens", 0))::int as "totalTokens",
          (SUM(gl."costUsd")::float / NULLIF(COUNT(DISTINCT gl."designId"), 0))::float as "avgCostPerDesign"
        FROM "GenerationLog" gl
        WHERE gl."costUsd" IS NOT NULL
          AND gl."createdAt" >= ${since}
        GROUP BY 1
        ORDER BY "totalCostUsd" DESC
      `,
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ cohort: "new" | "returning"; totalCostUsd: number; designs: number; avgCostPerDesign: number }>>`
        SELECT
          CASE WHEN u."createdAt" >= ${since} THEN 'new'::text ELSE 'returning'::text END as "cohort",
          SUM(gl."costUsd")::float as "totalCostUsd",
          COUNT(DISTINCT gl."designId")::int as "designs",
          (SUM(gl."costUsd")::float / NULLIF(COUNT(DISTINCT gl."designId"), 0))::float as "avgCostPerDesign"
        FROM "GenerationLog" gl
        JOIN "User" u ON u."id" = gl."userId"
        WHERE gl."costUsd" IS NOT NULL
          AND gl."createdAt" >= ${since}
          AND gl."userId" IS NOT NULL
        GROUP BY 1
      `,
      10_000
    ),
    withTimeout(
      prisma.$queryRaw<Array<{ totalTokensCacheHits: number; estimatedCostWithoutCachingUsd: number; actualCostUsd: number }>>`
        SELECT
          SUM(COALESCE(gl."estimatedCostUsd", 0))::float as "estimatedCostWithoutCachingUsd",
          SUM(COALESCE(gl."costUsd", 0))::float as "actualCostUsd",
          SUM(CASE WHEN gl."estimatedCostUsd" IS NOT NULL AND gl."costUsd" IS NOT NULL AND gl."estimatedCostUsd" > gl."costUsd" THEN COALESCE(gl."totalTokens", 0) ELSE 0 END)::int as "totalTokensCacheHits"
        FROM "GenerationLog" gl
        WHERE gl."createdAt" >= ${since}
          AND gl."costUsd" IS NOT NULL
          AND gl."estimatedCostUsd" IS NOT NULL
      `,
      10_000
    ).then((rows) => {
      const r = rows[0];
      const estimated = Number(r?.estimatedCostWithoutCachingUsd ?? 0);
      const actual = Number(r?.actualCostUsd ?? 0);
      const savingsUsd = estimated - actual;
      const savingsPercent = estimated === 0 ? null : (savingsUsd / estimated) * 100;
      return {
        totalTokensCacheHits: Number(r?.totalTokensCacheHits ?? 0),
        estimatedCostWithoutCachingUsd: estimated,
        actualCostUsd: actual,
        savingsUsd,
        savingsPercent,
      } satisfies AdminPromptCachingSavings;
    }),
    withTimeout(
      prisma.$queryRaw<Array<{ id: string; userId: string | null; model: string; platform: string | null; costUsd: number; estimatedCostUsd: number | null; createdAt: Date }>>`
        SELECT
          gl."id" as "id",
          gl."userId" as "userId",
          COALESCE(gl."model"::text, 'unknown') as "model",
          gl."platform" as "platform",
          gl."costUsd" as "costUsd",
          gl."estimatedCostUsd" as "estimatedCostUsd",
          gl."createdAt" as "createdAt"
        FROM "GenerationLog" gl
        WHERE gl."costUsd" IS NOT NULL
          AND gl."createdAt" >= ${since}
        ORDER BY gl."costUsd" DESC
        LIMIT 10
      `,
      10_000
    ),
  ]);

  return {
    byModel: byModel.map((r) => ({
      model: r.model,
      totalCostUsd: Number(r.totalCostUsd ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
      avgCostPerDesign: Number(r.avgCostPerDesign ?? 0),
    })),
    byPlatform: byPlatform.map((r) => ({
      platform: r.platform,
      totalCostUsd: Number(r.totalCostUsd ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
      avgCostPerDesign: Number(r.avgCostPerDesign ?? 0),
    })),
    byCohort: byCohort.map((r) => ({
      cohort: r.cohort,
      totalCostUsd: Number(r.totalCostUsd ?? 0),
      designs: Number(r.designs ?? 0),
      avgCostPerDesign: Number(r.avgCostPerDesign ?? 0),
    })),
    promptCachingSavings: savings,
    top10ExpensiveCalls: top10.map((r) => ({
      id: r.id,
      userId: r.userId,
      model: r.model,
      platform: r.platform,
      costUsd: Number(r.costUsd ?? 0),
      estimatedCostUsd: r.estimatedCostUsd == null ? null : Number(r.estimatedCostUsd),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    })),
  };
}

