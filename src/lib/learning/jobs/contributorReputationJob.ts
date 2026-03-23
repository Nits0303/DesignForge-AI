import { prisma } from "@/lib/db/prisma";

/**
 * Nightly: recompute contributorReputation and contributorTrusted from marketplace activity.
 */
export async function contributorReputationJob(_now = new Date()) {
  const groups = await prisma.template.groupBy({
    by: ["contributorUserId"],
    where: { contributorUserId: { not: null } },
  });

  let recordsUpdated = 0;

  for (const g of groups) {
    const uid = g.contributorUserId!;
    const tpls = await prisma.template.findMany({
      where: { contributorUserId: uid, submissionStatus: "approved" },
      select: {
        installCount: true,
        avgMarketplaceRating: true,
        marketplaceRatingCount: true,
      },
    });

    let reputation = 0;
    for (const t of tpls) {
      reputation += 10;
      if (t.marketplaceRatingCount >= 5 && t.avgMarketplaceRating != null) {
        reputation += Math.max(0, t.avgMarketplaceRating - 3) * 5;
      }
      reputation += Math.floor(t.installCount / 10);
    }

    const trusted = reputation >= 200 && tpls.length >= 3;

    await prisma.user.update({
      where: { id: uid },
      data: { contributorReputation: Math.round(reputation), contributorTrusted: trusted },
    });
    recordsUpdated += 1;
  }

  return { recordsProcessed: groups.length, recordsUpdated };
}
