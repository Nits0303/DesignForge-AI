import { prisma } from "@/lib/db/prisma";

export async function ensureDailySystemMetricTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DailySystemMetric" (
      "date" date PRIMARY KEY,
      "totalDesigns" integer NOT NULL DEFAULT 0,
      "activeUsers" integer NOT NULL DEFAULT 0,
      "totalCostUsd" double precision NOT NULL DEFAULT 0,
      "avgRevisions" double precision,
      "cacheHitRate" double precision,
      "newUsers" integer NOT NULL DEFAULT 0,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW()
    );
  `);
}

export async function upsertDailySystemMetric(forDate = new Date()) {
  await ensureDailySystemMetricTable();
  const dayStart = new Date(forDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<
    Array<{
      totalDesigns: number;
      activeUsers: number;
      totalCostUsd: number;
      avgRevisions: number | null;
      cacheHitRate: number | null;
      newUsers: number;
    }>
  >`
    WITH daily_designs AS (
      SELECT COUNT(*)::int as "totalDesigns"
      FROM "Design" d
      WHERE d."createdAt" >= ${dayStart}
        AND d."createdAt" < ${dayEnd}
    ),
    daily_active AS (
      SELECT COUNT(DISTINCT d."userId")::int as "activeUsers"
      FROM "Design" d
      WHERE d."createdAt" >= ${dayStart}
        AND d."createdAt" < ${dayEnd}
    ),
    daily_cost AS (
      SELECT COALESCE(SUM(gl."costUsd"), 0)::float as "totalCostUsd"
      FROM "GenerationLog" gl
      WHERE gl."createdAt" >= ${dayStart}
        AND gl."createdAt" < ${dayEnd}
    ),
    daily_rev AS (
      SELECT AVG(COALESCE(gl."revisionCount", 0))::float as "avgRevisions"
      FROM "GenerationLog" gl
      WHERE gl."createdAt" >= ${dayStart}
        AND gl."createdAt" < ${dayEnd}
        AND gl."wasApproved" IS NOT NULL
    ),
    daily_cache AS (
      SELECT
        CASE
          WHEN SUM(COALESCE(dv."promptTokens",0) + COALESCE(dv."completionTokens",0)) = 0 THEN NULL
          ELSE (SUM(COALESCE(dv."cachedTokens",0))::float /
               NULLIF(SUM(COALESCE(dv."promptTokens",0) + COALESCE(dv."completionTokens",0))::float, 0)) * 100
        END as "cacheHitRate"
      FROM "Design" d
      LEFT JOIN LATERAL (
        SELECT dv."promptTokens", dv."completionTokens", dv."cachedTokens"
        FROM "DesignVersion" dv
        WHERE dv."designId" = d.id
        ORDER BY dv."versionNumber" DESC
        LIMIT 1
      ) dv ON true
      WHERE d."createdAt" >= ${dayStart}
        AND d."createdAt" < ${dayEnd}
    ),
    daily_new_users AS (
      SELECT COUNT(*)::int as "newUsers"
      FROM "User" u
      WHERE u."createdAt" >= ${dayStart}
        AND u."createdAt" < ${dayEnd}
    )
    SELECT
      dd."totalDesigns" as "totalDesigns",
      da."activeUsers" as "activeUsers",
      dc."totalCostUsd" as "totalCostUsd",
      dr."avgRevisions" as "avgRevisions",
      dch."cacheHitRate" as "cacheHitRate",
      dnu."newUsers" as "newUsers"
    FROM daily_designs dd, daily_active da, daily_cost dc, daily_rev dr, daily_cache dch, daily_new_users dnu
  `;

  const r = rows[0] ?? {
    totalDesigns: 0,
    activeUsers: 0,
    totalCostUsd: 0,
    avgRevisions: null,
    cacheHitRate: null,
    newUsers: 0,
  };

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "DailySystemMetric"
      ("date", "totalDesigns", "activeUsers", "totalCostUsd", "avgRevisions", "cacheHitRate", "newUsers", "updatedAt")
    VALUES
      ($1::date, $2::int, $3::int, $4::double precision, $5::double precision, $6::double precision, $7::int, NOW())
    ON CONFLICT ("date")
    DO UPDATE SET
      "totalDesigns" = EXCLUDED."totalDesigns",
      "activeUsers" = EXCLUDED."activeUsers",
      "totalCostUsd" = EXCLUDED."totalCostUsd",
      "avgRevisions" = EXCLUDED."avgRevisions",
      "cacheHitRate" = EXCLUDED."cacheHitRate",
      "newUsers" = EXCLUDED."newUsers",
      "updatedAt" = NOW();
  `,
    dayStart.toISOString().slice(0, 10),
    Number(r.totalDesigns ?? 0),
    Number(r.activeUsers ?? 0),
    Number(r.totalCostUsd ?? 0),
    r.avgRevisions == null ? null : Number(r.avgRevisions),
    r.cacheHitRate == null ? null : Number(r.cacheHitRate),
    Number(r.newUsers ?? 0)
  );
}

