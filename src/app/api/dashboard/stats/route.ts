import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const cacheKey = `dashboard:stats:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return ok(JSON.parse(cached));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [monthCount, logs] = await Promise.all([
      prisma.generationLog.count({
        where: { userId, createdAt: { gte: monthStart } },
      }),
      prisma.generationLog.findMany({
        where: { userId },
        select: { revisionCount: true, design: { select: { platform: true } } },
        take: 1000,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const avgRevisions =
      logs.length > 0 ? logs.reduce((sum, l) => sum + (l.revisionCount ?? 0), 0) / logs.length : 0;
    const platformMap: Record<string, number> = {};
    for (const log of logs) {
      const p = log.design?.platform;
      if (!p) continue;
      platformMap[p] = (platformMap[p] ?? 0) + 1;
    }
    const topPlatform = Object.entries(platformMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const payload = { monthCount, avgRevisions, topPlatform };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 1800);
    return ok(payload);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
