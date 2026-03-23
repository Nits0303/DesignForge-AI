import { prisma } from "@/lib/db/prisma";
import { computePromptStructureHash } from "@/lib/learning/hashUtils";

/* PERFORMANCE: aggregates over GenerationLog + PromptScore — ensure indexes on promptStructureHash and GenerationLog(createdAt). */

function nowDateMinusHours(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function promptScoreJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  updatedPromptStructureHashes: string[];
  promptScoreUpdates: Array<{
    promptStructureHash: string;
    platform: string;
    format: string;
    oldScore: number | null;
    newScore: number;
    decidedCount: number;
    totalUses: number;
  }>;
}> {
  const since24h = nowDateMinusHours(24);

  // Backfill promptStructureHash for recent rows where possible.
  const missing = await prisma.generationLog.findMany({
    where: {
      createdAt: { gte: since24h },
      OR: [{ promptStructureHash: null }, { promptStructureHash: "" }],
    },
    select: {
      id: true,
      systemPromptVersion: true,
      templateIdsUsed: true,
      platform: true,
      format: true,
      design: { select: { platform: true, format: true } },
    },
  });

  let backfilled = 0;
  for (const log of missing) {
    const platform = log.platform ?? (log.design as any)?.platform;
    const format = log.format ?? (log.design as any)?.format;
    if (!platform || !format) continue;
    const hash = computePromptStructureHash({
      systemPromptVersion: log.systemPromptVersion,
      templateIds: log.templateIdsUsed ?? [],
      platform,
      format,
    });
    await prisma.generationLog.update({
      where: { id: log.id },
      data: { promptStructureHash: hash },
    });
    backfilled += 1;
  }

  // Distinct hashes in the window.
  const hashObjs = await prisma.generationLog.findMany({
    where: {
      createdAt: { gte: since24h },
      promptStructureHash: { not: null },
      platform: { not: null },
      format: { not: null },
    },
    distinct: ["promptStructureHash"],
    select: { promptStructureHash: true },
  });

  const hashes = hashObjs.map((h) => h.promptStructureHash).filter(Boolean) as string[];
  const hashChunks = chunkArray(hashes, 100);

  let recordsUpdated = 0;
  const updatedPromptStructureHashes: string[] = [];
  const promptScoreUpdates: Array<{
    promptStructureHash: string;
    platform: string;
    format: string;
    oldScore: number | null;
    newScore: number;
    decidedCount: number;
    totalUses: number;
  }> = [];

  for (const chunk of hashChunks) {
    const rows = await prisma.$queryRaw<
      Array<{
        promptStructureHash: string;
        platform: string;
        format: string;
        totalUses: number;
        decidedCount: number;
        zeroApprovedCount: number;
        avgRevisions: number;
      }>
    >`
      SELECT
        "promptStructureHash" as "promptStructureHash",
        "platform" as "platform",
        "format" as "format",
        COUNT(*)::int as "totalUses",
        SUM(CASE WHEN "wasApproved" IS NOT NULL THEN 1 ELSE 0 END)::int as "decidedCount",
        SUM(CASE WHEN "wasApproved" = true AND "revisionCount" = 0 THEN 1 ELSE 0 END)::int as "zeroApprovedCount",
        AVG("revisionCount") FILTER (WHERE "wasApproved" IS NOT NULL)::float as "avgRevisions"
      FROM "GenerationLog"
      WHERE "createdAt" >= ${since24h}
        AND "promptStructureHash" = ANY(${chunk}::text[])
      GROUP BY "promptStructureHash","platform","format"
    `;

    for (const row of rows) {
      const decidedCount = row.decidedCount ?? 0;
      const totalUses = row.totalUses ?? 0;
      const old = await prisma.promptScore.findUnique({
        where: { promptStructureHash: row.promptStructureHash },
        select: { score: true },
      });

      const sampleMeetsMin = decidedCount >= 5;
      const oldScore = old?.score ?? null;

      if (!sampleMeetsMin) {
        await prisma.promptScore.upsert({
          where: { promptStructureHash: row.promptStructureHash },
          create: {
            promptStructureHash: row.promptStructureHash,
            platform: row.platform,
            format: row.format,
            totalUses,
            // score stays at neutral prior (default 0.5)
          },
          update: {
            totalUses,
          },
        });
        recordsUpdated += 1;
        updatedPromptStructureHashes.push(row.promptStructureHash);
        continue;
      }

      const zeroRevisionRate = row.zeroApprovedCount / Math.max(1, decidedCount);
      const avgRevisions = row.avgRevisions ?? 0;
      const score = (zeroRevisionRate * 0.7 + (1 / (avgRevisions + 1)) * 0.3) as number;

      await prisma.promptScore.upsert({
        where: { promptStructureHash: row.promptStructureHash },
        create: {
          promptStructureHash: row.promptStructureHash,
          platform: row.platform,
          format: row.format,
          score,
          totalUses,
          zeroRevisionRate,
          avgRevisions,
        },
        update: {
          score,
          totalUses,
          zeroRevisionRate,
          avgRevisions,
        },
      });

      recordsUpdated += 1;
      updatedPromptStructureHashes.push(row.promptStructureHash);
      promptScoreUpdates.push({
        promptStructureHash: row.promptStructureHash,
        platform: row.platform,
        format: row.format,
        oldScore,
        newScore: score,
        decidedCount,
        totalUses,
      });
    }
  }

  return {
    recordsProcessed: hashes.length + backfilled,
    recordsUpdated,
    updatedPromptStructureHashes,
    promptScoreUpdates,
  };
}

