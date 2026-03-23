import { prisma } from "@/lib/db/prisma";
import { invalidateMarketplaceDetailCache, invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";

/**
 * Flag approved community templates with sustained low ratings for review.
 */
export async function marketplaceQualityJob(_now = new Date()) {
  const bad = await prisma.template.findMany({
    where: {
      submissionStatus: "approved",
      marketplaceRatingCount: { gte: 10 },
      avgMarketplaceRating: { lt: 2.5 },
      marketplaceQualityFlagged: false,
      contributorUserId: { not: null },
    },
    select: {
      id: true,
      name: true,
      contributorUserId: true,
    },
  });

  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });

  for (const t of bad) {
    await prisma.template.update({
      where: { id: t.id },
      data: { marketplaceQualityFlagged: true },
    });

    if (t.contributorUserId) {
      await prisma.notification.create({
        data: {
          userId: t.contributorUserId,
          type: "template_quality_review",
          title: "Template flagged for quality review",
          body: `“${t.name.slice(0, 60)}” has a low average rating. Please consider updating it.`,
          actionUrl: `/templates/contribute?resume=${t.id}`,
          metadata: { templateId: t.id } as any,
        },
      });
    }

    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "template_quality_admin",
        title: "Low-rated marketplace template",
        body: `“${t.name.slice(0, 60)}” flagged (avg below 2.5, 10+ ratings).`,
        actionUrl: `/admin/templates/review/${t.id}`,
        metadata: { templateId: t.id } as any,
      })),
    });

    await invalidateMarketplaceDetailCache(t.id);
  }

  if (bad.length) {
    await invalidateMarketplaceListCache();
  }

  return { recordsProcessed: bad.length, recordsUpdated: bad.length };
}
