import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function delByRedisMatch(match: string) {
  // Cursor-based SCAN to avoid KEYS on production.
  let cursor = "0";
  const toDelete: string[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await redis.scan(cursor, "MATCH", match, "COUNT", 500);
    cursor = res[0];
    const keys = res[1] as string[];
    if (keys?.length) toDelete.push(...keys);
    if (cursor === "0") break;
  }

  if (toDelete.length) {
    await redis.del(...toDelete);
  }
}

async function invalidateTemplateCaches(changedTemplateIds: string[]) {
  if (!changedTemplateIds.length) return;

  // Per-template cache entries (if any).
  await redis.del(...changedTemplateIds.map((id) => `template:${id}`));

  // Component selector + list endpoints use these prefixes.
  await Promise.all([delByRedisMatch("templates:intent:*"), delByRedisMatch("templates:list:*")]);
}

export async function templateApprovalJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  changedTemplates: Array<{ templateId: string; oldRate: number; newRate: number }>;
}> {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<
    Array<{
      templateId: string;
      usageCount: number;
      decidedCount: number;
      approvedCount: number;
    }>
  >`
    SELECT
      template_id::text as "templateId",
      COUNT(*)::int as "usageCount",
      SUM(CASE WHEN "wasApproved" IS NOT NULL THEN 1 ELSE 0 END)::int as "decidedCount",
      SUM(CASE WHEN "wasApproved" = true THEN 1 ELSE 0 END)::int as "approvedCount"
    FROM "GenerationLog" gl,
      LATERAL unnest(gl."templateIdsUsed") as template_id
    WHERE gl."createdAt" >= ${since30d}
    GROUP BY template_id
  `;

  if (!rows.length) {
    return { recordsProcessed: 0, recordsUpdated: 0, changedTemplates: [] };
  }

  const templateIds = rows.map((r) => r.templateId);
  const existing = await prisma.template.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, avgApprovalRate: true },
  });
  const existingMap = new Map(existing.map((t) => [t.id, t.avgApprovalRate ?? 0.5]));

  let changedTemplates: Array<{ templateId: string; oldRate: number; newRate: number }> = [];
  let recordsUpdated = 0;

  // Update in reasonably-sized chunks.
  for (const chunk of chunkArray(rows, 50)) {
    const updates = chunk.map(async (row) => {
      const oldRate = existingMap.get(row.templateId) ?? 0.5;

      const usageCount = row.usageCount ?? 0;
      const decidedCount = row.decidedCount ?? 0;
      const approvedCount = row.approvedCount ?? 0;

      const newRate = usageCount >= 10 ? approvedCount / Math.max(1, decidedCount) : 0.5;
      const delta = Math.abs(newRate - oldRate);

      if (delta > 0.05) {
        changedTemplates.push({ templateId: row.templateId, oldRate, newRate });
      }

      await prisma.template.update({
        where: { id: row.templateId },
        data: {
          usageCount,
          avgApprovalRate: newRate,
        },
      });
      recordsUpdated += 1;
    });

    await Promise.all(updates);
  }

  // Redis invalidation only when it matters.
  await invalidateTemplateCaches(changedTemplates.map((x) => x.templateId));

  return {
    recordsProcessed: rows.length,
    recordsUpdated,
    changedTemplates,
  };
}

