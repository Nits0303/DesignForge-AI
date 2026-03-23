import { prisma } from "@/lib/db/prisma";
import { AnalyticsPeriod, getPeriodRange } from "@/lib/analytics/period";
import { withTimeout } from "@/lib/analytics/timeout";

export type TopTemplateRow = {
  templateId: string;
  name: string;
  category: string;
  platform: string;
  usageCount: number;
  avgApprovalRate: number | null;
  avgRevisionsWhenUsed: number | null;
};

export async function getTopTemplates(
  userId: string,
  period: AnalyticsPeriod,
  limit: number
): Promise<TopTemplateRow[]> {
  const { start, end } = getPeriodRange(period);
  const rows = await withTimeout(
    (start
      ? prisma.$queryRaw<
          Array<{
            templateId: string;
            name: string;
            category: string;
            platform: string;
            usageCount: number;
            approvedCount: number;
            decidedCount: number;
            avgRevisionsWhenUsed: number | null;
          }>
        >`
          SELECT
            t.id as "templateId",
            t.name as "name",
            t.category as "category",
            t.platform as "platform",
            COUNT(*)::int as "usageCount",
            SUM(CASE WHEN gl."wasApproved" = true THEN 1 ELSE 0 END)::int as "approvedCount",
            SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END)::int as "decidedCount",
            AVG(
              CASE
                WHEN gl."wasApproved" IS NOT NULL THEN COALESCE(gl."revisionCount", 0)
                ELSE NULL
              END
            )::float as "avgRevisionsWhenUsed"
          FROM "GenerationLog" gl
          JOIN LATERAL unnest(gl."templateIdsUsed") as template_id ON true
          JOIN "Template" t ON t.id = template_id
          WHERE gl."userId" = ${userId}
            AND gl."templateIdsUsed" <> '{}'::text[]
            AND gl."createdAt" >= ${start}
            AND gl."createdAt" < ${end}
          GROUP BY t.id, t.name, t.category, t.platform
          ORDER BY "usageCount" DESC
          LIMIT ${limit}
        `
      : prisma.$queryRaw<
          Array<{
            templateId: string;
            name: string;
            category: string;
            platform: string;
            usageCount: number;
            approvedCount: number;
            decidedCount: number;
            avgRevisionsWhenUsed: number | null;
          }>
        >`
          SELECT
            t.id as "templateId",
            t.name as "name",
            t.category as "category",
            t.platform as "platform",
            COUNT(*)::int as "usageCount",
            SUM(CASE WHEN gl."wasApproved" = true THEN 1 ELSE 0 END)::int as "approvedCount",
            SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END)::int as "decidedCount",
            AVG(
              CASE
                WHEN gl."wasApproved" IS NOT NULL THEN COALESCE(gl."revisionCount", 0)
                ELSE NULL
              END
            )::float as "avgRevisionsWhenUsed"
          FROM "GenerationLog" gl
          JOIN LATERAL unnest(gl."templateIdsUsed") as template_id ON true
          JOIN "Template" t ON t.id = template_id
          WHERE gl."userId" = ${userId}
            AND gl."templateIdsUsed" <> '{}'::text[]
          GROUP BY t.id, t.name, t.category, t.platform
          ORDER BY "usageCount" DESC
          LIMIT ${limit}
        `),
    10_000
  );

  return rows.map((r) => ({
    templateId: r.templateId,
    name: r.name,
    category: r.category,
    platform: r.platform,
    usageCount: Number(r.usageCount ?? 0),
    avgApprovalRate: r.decidedCount ? (r.approvedCount / r.decidedCount) * 100 : null,
    avgRevisionsWhenUsed: r.avgRevisionsWhenUsed == null ? null : Number(r.avgRevisionsWhenUsed),
  }));
}

export type TemplateLeaderboardRow = {
  templateId: string;
  name: string;
  category: string;
  platform: string;
  usageCount: number;
  avgApprovalRate: number | null;
  avgRevisionsWhenUsed: number | null;
};

export async function getTemplateApprovalLeaderboard(limit: number): Promise<TemplateLeaderboardRow[]> {
  const rows = await withTimeout(
    prisma.$queryRaw<
      Array<{
        templateId: string;
        name: string;
        category: string;
        platform: string;
        usageCount: number;
        approvedCount: number;
        decidedCount: number;
        avgRevisionsWhenUsed: number | null;
      }>
    >`
      SELECT
        t.id as "templateId",
        t.name as "name",
        t.category as "category",
        t.platform as "platform",
        COUNT(*)::int as "usageCount",
        SUM(CASE WHEN gl."wasApproved" = true THEN 1 ELSE 0 END)::int as "approvedCount",
        SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END)::int as "decidedCount",
        AVG(CASE WHEN gl."wasApproved" IS NOT NULL THEN COALESCE(gl."revisionCount", 0) ELSE NULL END)::float as "avgRevisionsWhenUsed"
      FROM "GenerationLog" gl
      JOIN LATERAL unnest(gl."templateIdsUsed") as template_id ON true
      JOIN "Template" t ON t.id = template_id
      WHERE gl."templateIdsUsed" <> '{}'::text[]
      GROUP BY t.id, t.name, t.category, t.platform
      HAVING COUNT(*) >= 20
      ORDER BY
        (SUM(CASE WHEN gl."wasApproved" = true THEN 1 ELSE 0 END)::float / NULLIF(SUM(CASE WHEN gl."wasApproved" IS NOT NULL THEN 1 ELSE 0 END), 0)) DESC
      LIMIT ${limit}
    `,
    10_000
  );

  return rows.map((r) => ({
    templateId: r.templateId,
    name: r.name,
    category: r.category,
    platform: r.platform,
    usageCount: Number(r.usageCount ?? 0),
    avgApprovalRate: r.decidedCount ? (r.approvedCount / r.decidedCount) * 100 : null,
    avgRevisionsWhenUsed: r.avgRevisionsWhenUsed == null ? null : Number(r.avgRevisionsWhenUsed),
  }));
}

