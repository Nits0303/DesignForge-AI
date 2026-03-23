import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Last 30 days of API usage aggregated by day (all keys for the signed-in user). */
export async function GET() {
  try {
    const session = await getRequiredSession();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setUTCDate(windowStart.getUTCDate() - 29);

    const logs = await prisma.apiUsageLog.findMany({
      where: { userId: session.user.id, createdAt: { gte: windowStart } },
      select: { createdAt: true, statusCode: true },
    });

    const byDay = new Map<string, { requests: number; errors: number }>();
    for (const row of logs) {
      const d = row.createdAt.toISOString().slice(0, 10);
      const cur = byDay.get(d) ?? { requests: 0, errors: 0 };
      cur.requests += 1;
      if (row.statusCode >= 400) cur.errors += 1;
      byDay.set(d, cur);
    }

    const series: { date: string; requests: number; errors: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const dt = new Date(windowStart);
      dt.setUTCDate(windowStart.getUTCDate() + i);
      const key = dt.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? { requests: 0, errors: 0 };
      series.push({ date: key, ...bucket });
    }

    return ok({ series, totalRequests: logs.length }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to load usage", 500);
  }
}
