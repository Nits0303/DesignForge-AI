import { prisma } from "@/lib/db/prisma";
import { userWantsMarketplaceNotification } from "@/lib/marketplace/marketplacePrefs";

/** Recompute denormalized avg + count on Template after rating upsert. Sends milestone notifications. */
export async function recomputeTemplateMarketplaceRating(templateId: string): Promise<void> {
  const before = await prisma.template.findUnique({
    where: { id: templateId },
    select: {
      avgMarketplaceRating: true,
      marketplaceRatingCount: true,
      name: true,
      contributorUserId: true,
    },
  });

  const agg = await prisma.templateRating.aggregate({
    where: { templateId },
    _avg: { rating: true },
    _count: true,
  });

  const newAvg = agg._avg.rating ?? null;
  const newCount = agg._count;

  await prisma.template.update({
    where: { id: templateId },
    data: {
      avgMarketplaceRating: newAvg,
      marketplaceRatingCount: newCount,
    },
  });

  const contributorId = before?.contributorUserId;
  if (!contributorId) return;

  const wantsRated = await userWantsMarketplaceNotification(contributorId, "notify_template_rated");
  if (!wantsRated) return;

  const prevAvg = before?.avgMarketplaceRating ?? null;
  const prevCount = before?.marketplaceRatingCount ?? 0;
  const name = before?.name ?? "Your template";

  // Only when the first rating row exists (0 → 1). Updates to an existing rating keep count at 1.
  if (newCount === 1 && prevCount === 0) {
    await prisma.notification.create({
      data: {
        userId: contributorId,
        type: "template_rated",
        title: "First rating received",
        body: `“${name.slice(0, 60)}” received its first rating.`,
        actionUrl: `/templates/${templateId}`,
        metadata: { templateId } as any,
      },
    });
    return;
  }

  if (newAvg != null && newCount >= 5) {
    const crossed45 = prevAvg != null && prevAvg < 4.5 && newAvg >= 4.5;
    const crossed40 = prevAvg != null && prevAvg < 4.0 && newAvg >= 4.0 && newAvg < 4.5;
    if (crossed45) {
      await prisma.notification.create({
        data: {
          userId: contributorId,
          type: "template_rated",
          title: "Milestone: 4.5★ average",
          body: `“${name.slice(0, 60)}” reached a 4.5 star average rating.`,
          actionUrl: `/templates/${templateId}`,
          metadata: { templateId } as any,
        },
      });
    } else if (crossed40) {
      await prisma.notification.create({
        data: {
          userId: contributorId,
          type: "template_rated",
          title: "Milestone: 4.0★ average",
          body: `“${name.slice(0, 60)}” reached a 4.0 star average rating.`,
          actionUrl: `/templates/${templateId}`,
          metadata: { templateId } as any,
        },
      });
    }
  }
}
