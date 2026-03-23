import { prisma } from "@/lib/db/prisma";

/**
 * Nightly suggestions for new A/B tests (Sprint 16).
 */
export async function abTestSuggesterJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  suggestionsCreated: number;
}> {
  let created = 0;

  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Global revision pattern: many users adjusting typography / text on Instagram.
  const textPatterns = await prisma.revisionPattern.count({
    where: {
      isAggregated: true,
      lastSeenAt: { gte: since30d },
      OR: [
        { patternType: { contains: "text" } },
        { patternType: { contains: "font" } },
        { patternType: { contains: "headline" } },
      ],
    },
  });
  if (textPatterns >= 8) {
    const exists = await prisma.aBTestSuggestion.findFirst({
      where: { status: "pending", rationale: { contains: "Instagram" } },
    });
    if (!exists) {
      await prisma.aBTestSuggestion.create({
        data: {
          suggestedTestConfig: {
            platform: "instagram",
            format: "post",
            variants: [
              { name: "Control", allocationPercent: 50 },
              { name: "Larger headlines", allocationPercent: 50, promptModifications: { headlineSizeModifier: 1.15 } },
            ],
          } as object,
          rationale:
            "Many users are still nudging typography on Instagram — larger default headline sizing could remove that rework loop.",
          expectedEffect: "Higher zero-revision rate",
          priority: "high",
        },
      });
      created += 1;
    }
  }

  // Prompt score decline vs older window.
  const recentScores = await prisma.promptScore.findMany({
    where: { updatedAt: { gte: since14d } },
    select: { platform: true, format: true, score: true, totalUses: true },
  });
  const olderScores = await prisma.promptScore.findMany({
    where: { updatedAt: { lt: since14d } },
    select: { platform: true, format: true, score: true, totalUses: true },
  });
  const olderAvg = (plat: string, fmt: string) => {
    const rows = olderScores.filter((r) => r.platform === plat && r.format === fmt);
    if (!rows.length) return null;
    const tw = rows.reduce((a, r) => a + (r.totalUses || 1), 0);
    return rows.reduce((a, r) => a + r.score * (r.totalUses || 1), 0) / tw;
  };
  for (const r of recentScores) {
    const prev = olderAvg(r.platform, r.format);
    if (prev != null && r.score < prev * 0.88) {
      const exists = await prisma.aBTestSuggestion.findFirst({
        where: {
          status: "pending",
          rationale: { contains: `${r.platform}/${r.format}` },
        },
      });
      if (!exists) {
        await prisma.aBTestSuggestion.create({
          data: {
            suggestedTestConfig: {
              platform: r.platform,
              format: r.format,
              hint: "alternate_prompt_or_template_strategy",
            } as object,
            rationale: `${r.platform} ${r.format} prompt score is down ~12%+ vs the prior period — worth pitting a fresh prompt or template strategy against the default.`,
            expectedEffect: "Stabilise or recover quality",
            priority: "high",
          },
        });
        created += 1;
        break;
      }
    }
  }

  // Stale template recommendations.
  const oldRec = await prisma.templateRecommendation.findFirst({
    where: {
      createdAt: { lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      status: "pending",
    },
  });
  if (oldRec) {
    const exists = await prisma.aBTestSuggestion.findFirst({
      where: { status: "pending", rationale: { contains: "diversity" } },
    });
    if (!exists) {
      await prisma.aBTestSuggestion.create({
        data: {
          suggestedTestConfig: {
            platform: oldRec.platform,
            format: "post",
            variants: [
              { name: "Control", allocationPercent: 50 },
              { name: "Diversity", allocationPercent: 50, templateSelectionStrategy: "prefer_diversity" },
            ],
          } as object,
          rationale:
            "Template recommendations haven’t moved in a while — try biasing selection toward newer templates to keep output fresh.",
          expectedEffect: "More template variety without sacrificing quality",
          priority: "medium",
        },
      });
      created += 1;
    }
  }

  return { recordsProcessed: 1, recordsUpdated: created, suggestionsCreated: created };
}
