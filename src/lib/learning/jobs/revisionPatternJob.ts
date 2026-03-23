import { prisma } from "@/lib/db/prisma";

function jsonStableStringify(v: any): string {
  // Deterministic stringify for grouping on JSON.
  if (v === null || v === undefined) return "";
  if (typeof v !== "object") return JSON.stringify(v);
  const keys = Object.keys(v).sort();
  const obj: any = {};
  for (const k of keys) obj[k] = v[k];
  return JSON.stringify(obj);
}

function extractClassifierPattern(patternDetail: any): any {
  // Individual events store: { revisionPrompt, pattern, slideIndex }.
  // Consolidated patterns for inference should store the classifier pattern directly (direction/fontName/etc).
  return patternDetail?.pattern ?? patternDetail;
}

export async function revisionPatternJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  newlyDetectedGlobalPatterns: Array<{ patternType: string; patternDetail: any; frequency: number }>;
  globalPatternNotes: string[];
}> {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const decay60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const events = await prisma.revisionPattern.findMany({
    where: { isAggregated: false, lastSeenAt: { gte: since30d } },
    select: { id: true, userId: true, patternType: true, patternDetail: true, frequency: true, lastSeenAt: true },
  });

  // Per-user aggregation: group by (userId, patternType, classifierPattern).
  const perUserMap = new Map<
    string,
    {
      userId: string;
      patternType: string;
      classifierPattern: any;
      totalFrequency: number;
    }
  >();

  for (const e of events) {
    if (!e.userId) continue;
    const classifierPattern = extractClassifierPattern(e.patternDetail);
    const patternKey = jsonStableStringify(classifierPattern);
    const mapKey = `${e.userId}||${e.patternType}||${patternKey}`;
    const existing = perUserMap.get(mapKey);
    if (existing) {
      existing.totalFrequency += e.frequency ?? 0;
    } else {
      perUserMap.set(mapKey, {
        userId: e.userId,
        patternType: e.patternType,
        classifierPattern,
        totalFrequency: e.frequency ?? 0,
      });
    }
  }

  const affectedUserPatternPairs = new Set<string>();
  for (const item of perUserMap.values()) affectedUserPatternPairs.add(`${item.userId}||${item.patternType}`);

  // Replace aggregated rows for affected (userId, patternType) pairs.
  let recordsUpdated = 0;
  for (const pair of affectedUserPatternPairs) {
    const [userId, patternType] = pair.split("||");
    await prisma.revisionPattern.deleteMany({
      where: { userId, patternType, isAggregated: true },
    });
  }

  const createdPerUser = await Promise.all(
    Array.from(perUserMap.values()).map((item) =>
      prisma.revisionPattern.create({
        data: {
          userId: item.userId,
          patternType: item.patternType,
          patternDetail: item.classifierPattern,
          frequency: item.totalFrequency,
          lastSeenAt: now,
          designId: null,
          isAggregated: true,
        },
      })
    )
  );
  recordsUpdated += createdPerUser.length;

  // Global pattern detection based on appearance across active users.
  const genLogs30d = await prisma.generationLog.groupBy({
    by: ["userId"],
    where: { userId: { not: null }, createdAt: { gte: since30d } },
    _count: { _all: true },
  });
  const activeUsers = genLogs30d.filter((g) => (g._count?._all ?? 0) >= 5).map((g) => g.userId as string);
  const activeUserCount = activeUsers.length;
  const activeUserSet = new Set(activeUsers);

  // For each (patternType, classifierPattern) compute:
  // - set of active users that produced it
  // - total frequency
  const globalMap = new Map<
    string,
    { patternType: string; classifierPattern: any; activeUserIds: Set<string>; totalFrequency: number }
  >();

  for (const e of events) {
    if (!e.userId || !activeUserSet.has(e.userId)) continue;
    const classifierPattern = extractClassifierPattern(e.patternDetail);
    const patternKey = jsonStableStringify(classifierPattern);
    const mapKey = `${e.patternType}||${patternKey}`;
    const existing = globalMap.get(mapKey);
    if (!existing) {
      globalMap.set(mapKey, {
        patternType: e.patternType,
        classifierPattern,
        activeUserIds: new Set([e.userId]),
        totalFrequency: e.frequency ?? 0,
      });
    } else {
      existing.activeUserIds.add(e.userId);
      existing.totalFrequency += e.frequency ?? 0;
    }
  }

  const newlyDetectedGlobalPatterns: Array<{ patternType: string; patternDetail: any; frequency: number }> = [];
  const globalPatternNotes: string[] = [];

  // Replace global aggregated rows for affected patternTypes.
  const affectedGlobalPatternTypes = new Set<string>();
  for (const v of globalMap.values()) affectedGlobalPatternTypes.add(v.patternType);
  if (affectedGlobalPatternTypes.size) {
    await prisma.revisionPattern.deleteMany({
      where: { userId: null, isAggregated: true, patternType: { in: Array.from(affectedGlobalPatternTypes) } },
    });
  }

  if (activeUserCount > 0) {
    const createdGlobal = await Promise.all(
      Array.from(globalMap.values()).map(async (g) => {
        const ratio = g.activeUserIds.size / activeUserCount;
        if (ratio <= 0.2) return null;
        if ((g.totalFrequency ?? 0) > 50) {
          globalPatternNotes.push(
            `NOTE: Global pattern "${g.patternType}" appears frequently (${g.totalFrequency} revisions). Consider updating relevant templates/system defaults.`
          );
        }
        newlyDetectedGlobalPatterns.push({
          patternType: g.patternType,
          patternDetail: g.classifierPattern,
          frequency: g.totalFrequency,
        });

        return prisma.revisionPattern.create({
          data: {
            userId: null,
            patternType: g.patternType,
            patternDetail: g.classifierPattern,
            frequency: g.totalFrequency,
            lastSeenAt: now,
            designId: null,
            isAggregated: true,
          },
        });
      })
    );
    recordsUpdated += createdGlobal.filter(Boolean).length;
  }

  // Pattern decay: halve aggregated pattern frequencies for records older than 60 days.
  const decayed = await prisma.revisionPattern.findMany({
    where: { isAggregated: true, lastSeenAt: { lt: decay60d }, frequency: { gt: 0 } },
    select: { id: true, frequency: true },
  });

  if (decayed.length) {
    await Promise.all(
      decayed.map((r) =>
        prisma.revisionPattern.update({
          where: { id: r.id },
          data: { frequency: Math.max(1, Math.floor((r.frequency ?? 0) / 2)) },
        })
      )
    );
    recordsUpdated += decayed.length;
  }

  return {
    recordsProcessed: events.length,
    recordsUpdated,
    newlyDetectedGlobalPatterns,
    globalPatternNotes,
  };
}

