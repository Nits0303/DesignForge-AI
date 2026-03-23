import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";

export type AdminTemplateLeaderboardRow = {
  templateId: string;
  name: string;
  category: string;
  platform: string;
  source: string | null;
  usageCount: number;
  avgApprovalRate: number | null;
  avgRevisionCountWhenUsed: number | null;
};

export async function getAdminTemplateLeaderboard(params: { minUses?: number } = {}): Promise<
  AdminTemplateLeaderboardRow[]
> {
  const minUses = params.minUses ?? 20;

  const rows = await withTimeout(
    prisma.$queryRaw<
      Array<{
        templateId: string;
        name: string;
        category: string;
        platform: string;
        source: string | null;
        usageCount: number;
        approvedCount: number;
        decidedCount: number;
        avgRevisionCountWhenUsed: number | null;
      }>
    >`
      SELECT
        t.id as "templateId",
        t.name as "name",
        t.category as "category",
        t.platform as "platform",
        t.source as "source",
        COUNT(*)::int as "usageCount",
        SUM(CASE WHEN gl."wasApproved" = true THEN 1 ELSE 0 END)::int as "approvedCount",
        SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END)::int as "decidedCount",
        AVG(
          CASE WHEN gl."wasApproved" IS NOT NULL THEN COALESCE(gl."revisionCount", 0) ELSE NULL END
        )::float as "avgRevisionCountWhenUsed"
      FROM "GenerationLog" gl
      JOIN LATERAL unnest(gl."templateIdsUsed") as template_id ON true
      JOIN "Template" t ON t.id = template_id
      WHERE gl."templateIdsUsed" <> '{}'::text[]
        AND t."isActive" = true
      GROUP BY t.id, t.name, t.category, t.platform, t.source
      HAVING COUNT(*) >= ${minUses}
      ORDER BY
        (SUM(CASE WHEN gl."wasApproved" = true THEN 1 ELSE 0 END)::float /
         NULLIF(SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END), 0)) DESC NULLS LAST
      LIMIT 2000
    `,
    10_000
  );

  return rows.map((r) => ({
    templateId: r.templateId,
    name: r.name,
    category: r.category,
    platform: r.platform,
    source: r.source,
    usageCount: Number(r.usageCount ?? 0),
    avgApprovalRate: r.decidedCount
      ? (r.approvedCount / r.decidedCount) * 100
      : null,
    avgRevisionCountWhenUsed: r.avgRevisionCountWhenUsed == null ? null : Number(r.avgRevisionCountWhenUsed),
  }));
}

export type AdminTemplateRecommendationRow = {
  id: string;
  patternType: string;
  platform: string;
  affectedTemplateIds: string[];
  frequency: number | null;
  recommendation: string;
  status: "pending" | "applied" | "dismissed";
};

export async function getAdminTemplateRecommendations(): Promise<AdminTemplateRecommendationRow[]> {
  const rows = await withTimeout(
    prisma.templateRecommendation.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
    }),
    10_000
  );

  return rows.map((r) => ({
    id: r.id,
    patternType: r.patternType,
    platform: r.platform,
    affectedTemplateIds: r.affectedTemplateIds,
    frequency: r.frequency == null ? null : Number(r.frequency),
    recommendation: r.recommendation,
    status: r.status,
  }));
}

