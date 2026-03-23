import { prisma } from "@/lib/db/prisma";

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = keyFn(x);
    const existing = m.get(k);
    if (existing) existing.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function linearRegressionSlope(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function buildRecommendationText(patternType: string, direction: string | null, platform: string) {
  switch (patternType) {
    case "headline_resize": {
      if (direction === "larger") return `Consider increasing the default headline font size by 15-20% in ${platform} templates.`;
      if (direction === "smaller") return `Consider decreasing the default headline font size by 15-20% in ${platform} templates.`;
      return `Consider adjusting default headline sizing in ${platform} templates based on user revision patterns.`;
    }
    case "bg_color_change": {
      if (direction === "dark") return `Consider defaulting to dark backgrounds in ${platform} templates where appropriate.`;
      if (direction === "light") return `Consider defaulting to light backgrounds in ${platform} templates where appropriate.`;
      return `Consider adjusting default background color in ${platform} templates based on user revision patterns.`;
    }
    case "spacing_adjust": {
      if (direction === "more_space") return `Consider increasing default spacing/padding in ${platform} templates (more whitespace).`;
      if (direction === "less_space") return `Consider reducing default spacing/padding in ${platform} templates (more compact layout).`;
      return `Consider adjusting default spacing in ${platform} templates based on revision patterns.`;
    }
    case "cta_addition":
      return `Consider ensuring CTA elements are included by default in ${platform} templates.`;
    default:
      return `Consider improving ${patternType} handling in ${platform} templates based on user revision patterns.`;
  }
}

export async function globalPatternJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  templateRecommendationsCreated: number;
  decliningPromptPlatforms: string[];
  costOverrunFindings: Array<{ platform: string; format: string; actualCost: number; estimatedCost: number }>;
}> {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threshold = 0.25; // 25%

  // 1) Pattern threshold detection for patternType+platform.
  const designs = await prisma.design.findMany({
    where: { createdAt: { gte: since30d } },
    select: { id: true, platform: true },
  });

  const totalDesignsByPlatform = new Map<string, number>();
  for (const d of designs) totalDesignsByPlatform.set(d.platform, (totalDesignsByPlatform.get(d.platform) ?? 0) + 1);

  const eventRevisions = await prisma.revisionPattern.findMany({
    where: { isAggregated: false, lastSeenAt: { gte: since30d }, designId: { not: null } },
    select: { patternType: true, designId: true, patternDetail: true },
  });

  const designsById = new Map<string, string>();
  for (const d of designs) designsById.set(d.id, d.platform);

  // numerator by (platform, patternType) and also keep modal direction where available
  const designsWithPattern = new Map<string, Set<string>>();
  const directionCounts = new Map<string, Map<string, number>>();

  for (const r of eventRevisions) {
    const platform = designsById.get(r.designId as string);
    if (!platform) continue;
    const key = `${platform}||${r.patternType}`;
    const set = designsWithPattern.get(key) ?? new Set<string>();
    set.add(r.designId as string);
    designsWithPattern.set(key, set);

    const direction =
      (r.patternDetail as any)?.direction ??
      (r.patternDetail as any)?.pattern?.direction ??
      null;
    if (!directionCounts.has(key)) directionCounts.set(key, new Map());
    const m = directionCounts.get(key)!;
    if (direction) m.set(direction, (m.get(direction) ?? 0) + 1);
  }

  let templateRecommendationsCreated = 0;
  const recCreatePromises: Promise<any>[] = [];

  for (const [key, designIdSet] of designsWithPattern.entries()) {
    const [platform, patternType] = key.split("||");
    const totalDesigns = totalDesignsByPlatform.get(platform) ?? 0;
    if (!totalDesigns) continue;
    const pct = designIdSet.size / totalDesigns;
    if (pct <= threshold) continue;

    const dCounts = directionCounts.get(key);
    const modalDirection = dCounts && dCounts.size ? Array.from(dCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] : null;

    // affectedTemplateIds: template IDs used in generation logs for designs in this group.
    const designIds = Array.from(designIdSet).slice(0, 500); // limit to keep batch fast
    const genLogs = await prisma.generationLog.findMany({
      where: { designId: { in: designIds } },
      select: { templateIdsUsed: true },
    });
    const affectedTemplateIds = Array.from(new Set(genLogs.flatMap((l) => l.templateIdsUsed))).slice(0, 20);

    const recommendation = buildRecommendationText(patternType, modalDirection ?? null, platform);
    recCreatePromises.push(
      prisma.templateRecommendation.create({
        data: {
          patternType,
          platform,
          affectedTemplateIds,
          frequency: pct,
          recommendation,
          status: "pending",
        },
      })
    );
    templateRecommendationsCreated += 1;
  }

  await Promise.all(recCreatePromises);

  // 2) Prompt structure evolution signal: slope of average PromptScore over 30 days.
  const promptScores = await prisma.promptScore.findMany({
    where: { updatedAt: { gte: since30d } },
    select: { platform: true, score: true, updatedAt: true },
  });

  const byPlatform = groupBy(promptScores, (p) => p.platform);
  const decliningPromptPlatforms: string[] = [];

  for (const [platform, points] of byPlatform.entries()) {
    const byDay = groupBy(points, (p) => p.updatedAt.toISOString().slice(0, 10));
    const series = Array.from(byDay.entries())
      .map(([date, arr]) => {
        const avg = arr.reduce((a, x) => a + x.score, 0) / Math.max(1, arr.length);
        const x = new Date(date).getTime();
        return { x, y: avg };
      })
      .sort((a, b) => a.x - b.x);

    const slope = linearRegressionSlope(series.map((s, idx) => ({ x: idx, y: s.y })));
    if (slope < 0) decliningPromptPlatforms.push(platform);
  }

  // 3) Cost optimisation: actual cost vs estimated cost by platform+format.
  const costLogs = await prisma.generationLog.findMany({
    where: {
      createdAt: { gte: since30d },
      estimatedCostUsd: { not: null },
      costUsd: { not: null },
      platform: { not: null },
      format: { not: null },
    },
    select: { platform: true, format: true, costUsd: true, estimatedCostUsd: true },
  });

  const byCombo = groupBy(costLogs, (l) => `${l.platform}||${l.format}`);
  const costOverrunFindings: Array<{ platform: string; format: string; actualCost: number; estimatedCost: number }> = [];

  for (const [comboKey, arr] of byCombo.entries()) {
    const [platform, format] = comboKey.split("||");
    const actualCost = arr.reduce((a, x) => a + (x.costUsd ?? 0), 0);
    const estimatedCost = arr.reduce((a, x) => a + (x.estimatedCostUsd ?? 0), 0);
    if (estimatedCost > 0 && actualCost > estimatedCost * 1.3) {
      costOverrunFindings.push({ platform, format, actualCost, estimatedCost });
    }
  }

  return {
    recordsProcessed: eventRevisions.length,
    recordsUpdated: templateRecommendationsCreated,
    templateRecommendationsCreated,
    decliningPromptPlatforms,
    costOverrunFindings,
  };
}

