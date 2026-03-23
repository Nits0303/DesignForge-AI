import { NextResponse } from "next/server";
import { fail } from "@/lib/api/response";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  try {
    await requireAdminUser();
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<
      Array<{
        date: string;
        totalDesigns: number;
        activeUsers: number;
        totalCostUsd: number;
        avgRevisions: number | null;
      }>
    >`
      WITH daily_designs AS (
        SELECT date_trunc('day', d."createdAt") as day, COUNT(*)::int as "totalDesigns"
        FROM "Design" d
        WHERE d."createdAt" >= ${since}
        GROUP BY 1
      ),
      daily_active AS (
        SELECT date_trunc('day', d."createdAt") as day, COUNT(DISTINCT d."userId")::int as "activeUsers"
        FROM "Design" d
        WHERE d."createdAt" >= ${since}
        GROUP BY 1
      ),
      daily_cost AS (
        SELECT date_trunc('day', gl."createdAt") as day, SUM(COALESCE(gl."costUsd",0))::float as "totalCostUsd"
        FROM "GenerationLog" gl
        WHERE gl."createdAt" >= ${since}
        GROUP BY 1
      ),
      daily_rev AS (
        SELECT date_trunc('day', gl."createdAt") as day, AVG(COALESCE(gl."revisionCount",0))::float as "avgRevisions"
        FROM "GenerationLog" gl
        WHERE gl."createdAt" >= ${since}
          AND gl."wasApproved" IS NOT NULL
        GROUP BY 1
      )
      SELECT
        to_char(coalesce(dd.day, da.day, dc.day, dr.day), 'YYYY-MM-DD') as "date",
        COALESCE(dd."totalDesigns", 0)::int as "totalDesigns",
        COALESCE(da."activeUsers", 0)::int as "activeUsers",
        COALESCE(dc."totalCostUsd", 0)::float as "totalCostUsd",
        dr."avgRevisions" as "avgRevisions"
      FROM daily_designs dd
      FULL OUTER JOIN daily_active da ON da.day = dd.day
      FULL OUTER JOIN daily_cost dc ON dc.day = COALESCE(dd.day, da.day)
      FULL OUTER JOIN daily_rev dr ON dr.day = COALESCE(dd.day, da.day, dc.day)
      ORDER BY "date" ASC
    `;

    const csv = [
      "date,totalDesigns,activeUsers,totalCostUsd,avgRevisions",
      ...rows.map((r) =>
        [r.date, r.totalDesigns, r.activeUsers, Number(r.totalCostUsd ?? 0).toFixed(6), r.avgRevisions == null ? "" : Number(r.avgRevisions).toFixed(4)]
          .map(csvEscape)
          .join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="designforge_admin_aggregate_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

