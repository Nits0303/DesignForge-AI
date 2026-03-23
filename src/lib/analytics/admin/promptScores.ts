import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";

export type AdminPromptScoreRow = {
  promptStructureHash: string;
  platform: string;
  format: string;
  score: number;
  totalUses: number;
  zeroRevisionRate: number | null;
  avgRevisions: number | null;
  updatedAt: string;
};

export async function getAdminPromptScores(params: {
  platform?: string;
  format?: string;
  minUses?: number;
}): Promise<AdminPromptScoreRow[]> {
  const { platform, format, minUses = 0 } = params;

  const where: string[] = [];
  // We build SQL with branching for optional filters to keep it simple and safe.

  // Prisma's tagged template handles values; we just branch on the presence of filters.
  const rows = await withTimeout(
    (() => {
      if (platform && format) {
        return prisma.$queryRaw<
          Array<{
            promptStructureHash: string;
            platform: string;
            format: string;
            score: number;
            totalUses: number;
            zeroRevisionRate: number | null;
            avgRevisions: number | null;
            updatedAt: Date;
          }>
        >`
          SELECT
            ps."promptStructureHash" as "promptStructureHash",
            ps."platform" as "platform",
            ps."format" as "format",
            ps."score" as "score",
            ps."totalUses" as "totalUses",
            ps."zeroRevisionRate" as "zeroRevisionRate",
            ps."avgRevisions" as "avgRevisions",
            ps."updatedAt" as "updatedAt"
          FROM "PromptScore" ps
          WHERE ps."platform" = ${platform}
            AND ps."format" = ${format}
            AND ps."totalUses" >= ${minUses}
          ORDER BY ps."score" DESC
          LIMIT 2000
        `;
      }

      if (platform && !format) {
        return prisma.$queryRaw<
          Array<{
            promptStructureHash: string;
            platform: string;
            format: string;
            score: number;
            totalUses: number;
            zeroRevisionRate: number | null;
            avgRevisions: number | null;
            updatedAt: Date;
          }>
        >`
          SELECT
            ps."promptStructureHash" as "promptStructureHash",
            ps."platform" as "platform",
            ps."format" as "format",
            ps."score" as "score",
            ps."totalUses" as "totalUses",
            ps."zeroRevisionRate" as "zeroRevisionRate",
            ps."avgRevisions" as "avgRevisions",
            ps."updatedAt" as "updatedAt"
          FROM "PromptScore" ps
          WHERE ps."platform" = ${platform}
            AND ps."totalUses" >= ${minUses}
          ORDER BY ps."score" DESC
          LIMIT 2000
        `;
      }

      if (!platform && format) {
        return prisma.$queryRaw<
          Array<{
            promptStructureHash: string;
            platform: string;
            format: string;
            score: number;
            totalUses: number;
            zeroRevisionRate: number | null;
            avgRevisions: number | null;
            updatedAt: Date;
          }>
        >`
          SELECT
            ps."promptStructureHash" as "promptStructureHash",
            ps."platform" as "platform",
            ps."format" as "format",
            ps."score" as "score",
            ps."totalUses" as "totalUses",
            ps."zeroRevisionRate" as "zeroRevisionRate",
            ps."avgRevisions" as "avgRevisions",
            ps."updatedAt" as "updatedAt"
          FROM "PromptScore" ps
          WHERE ps."format" = ${format}
            AND ps."totalUses" >= ${minUses}
          ORDER BY ps."score" DESC
          LIMIT 2000
        `;
      }

      return prisma.$queryRaw<
        Array<{
          promptStructureHash: string;
          platform: string;
          format: string;
          score: number;
          totalUses: number;
          zeroRevisionRate: number | null;
          avgRevisions: number | null;
          updatedAt: Date;
        }>
      >`
        SELECT
          ps."promptStructureHash" as "promptStructureHash",
          ps."platform" as "platform",
          ps."format" as "format",
          ps."score" as "score",
          ps."totalUses" as "totalUses",
          ps."zeroRevisionRate" as "zeroRevisionRate",
          ps."avgRevisions" as "avgRevisions",
          ps."updatedAt" as "updatedAt"
        FROM "PromptScore" ps
        WHERE ps."totalUses" >= ${minUses}
        ORDER BY ps."score" DESC
        LIMIT 2000
      `;
    })(),
    10_000
  );

  return rows.map((r) => ({
    promptStructureHash: r.promptStructureHash,
    platform: r.platform,
    format: r.format,
    score: Number(r.score ?? 0),
    totalUses: Number(r.totalUses ?? 0),
    zeroRevisionRate: r.zeroRevisionRate == null ? null : Number(r.zeroRevisionRate),
    avgRevisions: r.avgRevisions == null ? null : Number(r.avgRevisions),
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
  }));
}

