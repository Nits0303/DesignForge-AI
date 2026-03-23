import { prisma } from "@/lib/db/prisma";

function startOfUtcDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function userQualityMetricsJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  comparison: {
    groupWithPreferences: {
      userCount: number;
      avgDesignQualityScore: number;
      avgAvgRevisions: number;
      avgZeroRevisionRate: number;
    };
    groupWithoutPreferences: {
      userCount: number;
      avgDesignQualityScore: number;
      avgAvgRevisions: number;
      avgZeroRevisionRate: number;
    };
  };
}> {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const overallStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const day0 = startOfUtcDay(now);
  const days = Array.from({ length: 7 }, (_, i) => new Date(day0.getTime() - (6 - i) * 24 * 60 * 60 * 1000));

  const genByUser = await prisma.generationLog.groupBy({
    by: ["userId"],
    where: { userId: { not: null }, createdAt: { gte: since30d } },
    _count: { _all: true },
  });
  const activeUsers = genByUser
    .filter((g) => (g._count?._all ?? 0) >= 5)
    .map((g) => g.userId as string);

  let recordsUpdated = 0;
  let recordsProcessed = 0;

  const todayIdx = days.length - 1;
  const todayMetricsByUser = new Map<
    string,
    { designQualityScore: number; avgAvgRevisions: number; avgZeroRevisionRate: number; activePreferences: number }
  >();

  for (const userId of activeUsers) {
    const activePreferences = await prisma.userPreference.count({
      where: { userId, confidence: { gt: 0.6 } },
    });

    const logs = await prisma.generationLog.findMany({
      where: { userId, createdAt: { gte: overallStart }, wasApproved: { not: null } },
      select: { revisionCount: true, wasApproved: true, createdAt: true },
    });

    for (let di = 0; di < days.length; di++) {
      const dayStart = days[di];
      const windowStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const windowLogs = logs.filter((l) => l.createdAt >= windowStart && l.createdAt < windowEnd);
      const designCount = windowLogs.length;
      const avgRevisions =
        designCount === 0 ? 0 : windowLogs.reduce((a, l) => a + (l.revisionCount ?? 0), 0) / designCount;
      const zeroCount = windowLogs.filter((l) => (l.wasApproved ?? false) === true && (l.revisionCount ?? 0) === 0).length;
      const zeroRevisionRate = designCount === 0 ? 0 : zeroCount / designCount;
      const designQualityScore =
        designCount === 0
          ? 0
          : windowLogs.reduce((a, l) => a + 1 / ((l.revisionCount ?? 0) + 1), 0) / designCount;

      recordsProcessed += 1;
      await prisma.userQualityMetric.upsert({
        where: { userId_date: { userId, date: dayStart } },
        create: {
          userId,
          date: dayStart,
          designQualityScore,
          avgRevisions,
          zeroRevisionRate,
          designCount,
          activePreferences,
        },
        update: {
          designQualityScore,
          avgRevisions,
          zeroRevisionRate,
          designCount,
          activePreferences,
        },
      });
      recordsUpdated += 1;

      if (di === todayIdx) {
        todayMetricsByUser.set(userId, {
          designQualityScore,
          avgAvgRevisions: avgRevisions,
          avgZeroRevisionRate: zeroRevisionRate,
          activePreferences,
        });
      }
    }
  }

  const todayEntries = Array.from(todayMetricsByUser.entries()).map(([userId, m]) => ({ userId, ...m }));
  const groupWithPreferences = todayEntries.filter((e) => e.activePreferences >= 3);
  const groupWithoutPreferences = todayEntries.filter((e) => e.activePreferences === 0);

  const avg = (arr: any[], key: string) =>
    arr.length ? arr.reduce((a, x) => a + Number(x[key] ?? 0), 0) / arr.length : 0;

  return {
    recordsProcessed,
    recordsUpdated,
    comparison: {
      groupWithPreferences: {
        userCount: groupWithPreferences.length,
        avgDesignQualityScore: avg(groupWithPreferences, "designQualityScore"),
        avgAvgRevisions: avg(groupWithPreferences, "avgAvgRevisions"),
        avgZeroRevisionRate: avg(groupWithPreferences, "avgZeroRevisionRate"),
      },
      groupWithoutPreferences: {
        userCount: groupWithoutPreferences.length,
        avgDesignQualityScore: avg(groupWithoutPreferences, "designQualityScore"),
        avgAvgRevisions: avg(groupWithoutPreferences, "avgAvgRevisions"),
        avgZeroRevisionRate: avg(groupWithoutPreferences, "avgZeroRevisionRate"),
      },
    },
  };
}

