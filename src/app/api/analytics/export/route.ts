import { NextResponse } from "next/server";
import archiver from "archiver";
import { getRequiredSession } from "@/lib/auth/session";
import { fail } from "@/lib/api/response";
import { AnalyticsPeriod, getPeriodRange } from "@/lib/analytics/period";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const url = new URL(req.url);
    const period = (url.searchParams.get("period") ?? "30d") as AnalyticsPeriod;
    const { start, end } = getPeriodRange(period === "all" ? "90d" : period);

    if (!start) return fail("VALIDATION_ERROR", "Invalid period", 400);

    const [designRows, costRows, revRows] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string; platform: string; format: string; revisionCount: number; approved: boolean | null; costUsd: number }>>`
        SELECT
          to_char(d."createdAt",'YYYY-MM-DD') as "date",
          COALESCE(d.platform::text,'unknown') as "platform",
          COALESCE(d.format::text,'unknown') as "format",
          COALESCE(gl."revisionCount",0)::int as "revisionCount",
          gl."wasApproved" as "approved",
          COALESCE(gl."costUsd",0)::float as "costUsd"
        FROM "Design" d
        LEFT JOIN LATERAL (
          SELECT gl."revisionCount", gl."wasApproved", gl."costUsd"
          FROM "GenerationLog" gl
          WHERE gl."designId" = d.id
          ORDER BY gl."createdAt" DESC
          LIMIT 1
        ) gl ON true
        WHERE d."userId" = ${userId}
          AND d."createdAt" >= ${start}
          AND d."createdAt" < ${end}
        ORDER BY d."createdAt" ASC
      `,
      prisma.$queryRaw<Array<{ date: string; model: string; totalCostUsd: number }>>`
        SELECT
          to_char(date_trunc('day', gl."createdAt"), 'YYYY-MM-DD') as "date",
          COALESCE(gl."model"::text, 'unknown') as "model",
          SUM(COALESCE(gl."costUsd",0))::float as "totalCostUsd"
        FROM "GenerationLog" gl
        WHERE gl."userId" = ${userId}
          AND gl."createdAt" >= ${start}
          AND gl."createdAt" < ${end}
          AND gl."costUsd" IS NOT NULL
        GROUP BY 1,2
        ORDER BY 1 ASC, 2 ASC
      `,
      prisma.$queryRaw<Array<{ patternType: string; frequency: number }>>`
        SELECT
          rp."patternType" as "patternType",
          SUM(COALESCE(rp."frequency",0))::int as "frequency"
        FROM "RevisionPattern" rp
        WHERE rp."userId" = ${userId}
          AND rp."lastSeenAt" >= ${start}
          AND rp."lastSeenAt" < ${end}
        GROUP BY 1
        ORDER BY "frequency" DESC
      `,
    ]);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const zipPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on("data", (d: any) => chunks.push(Buffer.from(d)));
      archive.on("error", reject);
      archive.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const designCsv = [
      "date,platform,format,revisionCount,approved,costUsd",
      ...designRows.map((r) =>
        [r.date, r.platform, r.format, r.revisionCount, r.approved == null ? "" : r.approved, Number(r.costUsd ?? 0).toFixed(6)]
          .map(csvEscape)
          .join(",")
      ),
    ].join("\n");
    archive.append(designCsv, { name: "design_log.csv" });

    const costCsv = [
      "date,model,totalCostUsd",
      ...costRows.map((r) => [r.date, r.model, Number(r.totalCostUsd ?? 0).toFixed(6)].map(csvEscape).join(",")),
    ].join("\n");
    archive.append(costCsv, { name: "cost_summary.csv" });

    const revCsv = [
      "patternType,frequency",
      ...revRows.map((r) => [r.patternType, r.frequency].map(csvEscape).join(",")),
    ].join("\n");
    archive.append(revCsv, { name: "revision_patterns.csv" });

    archive.finalize();
    const zip = await zipPromise;
    const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;

    const filename = `designforge_analytics_${period}_${new Date().toISOString().slice(0, 10)}.zip`;
    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

