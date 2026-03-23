import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { auth } from "@/lib/auth/auth";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const session = await auth();
    const cacheKey = `marketplace:detail:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const base = JSON.parse(cached);
      if (session?.user?.id) {
        const [inst, rating] = await Promise.all([
          prisma.templateInstallation.findUnique({
            where: { userId_templateId: { userId: session.user.id, templateId: id } },
          }),
          prisma.templateRating.findUnique({
            where: { userId_templateId: { userId: session.user.id, templateId: id } },
          }),
        ]);
        return ok({ ...base, isInstalledByCurrentUser: !!inst?.isActive, currentUserRating: rating });
      }
      return ok({ ...base, isInstalledByCurrentUser: false, currentUserRating: null });
    }

    const t = await prisma.template.findFirst({
      where: { id, submissionStatus: "approved", isActive: true, marketplaceQualityFlagged: false },
      include: {
        contributor: { select: { id: true, name: true, avatarUrl: true, createdAt: true, contributorReputation: true, contributorTrusted: true } },
      },
    });
    if (!t) return fail("NOT_FOUND", "Template not found", 404);

    const groups = await prisma.templateRating.groupBy({
      by: ["rating"],
      where: { templateId: id },
      _count: { _all: true },
    });
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of groups) {
      const k = Math.min(5, Math.max(1, g.rating)) as 1 | 2 | 3 | 4 | 5;
      dist[k] = g._count._all;
    }

    const rest = t;
    const payload = {
      ...rest,
      ratingDistribution: dist,
      avgRating: t.avgMarketplaceRating,
      ratingCount: t.marketplaceRatingCount,
      usageInDesigns: t.usageCount,
    };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 60 * 5);

    if (session?.user?.id) {
      const [inst, rating] = await Promise.all([
        prisma.templateInstallation.findUnique({
          where: { userId_templateId: { userId: session.user.id, templateId: id } },
        }),
        prisma.templateRating.findUnique({
          where: { userId_templateId: { userId: session.user.id, templateId: id } },
        }),
      ]);
      return ok({ ...payload, isInstalledByCurrentUser: !!inst?.isActive, currentUserRating: rating });
    }
    return ok({ ...payload, isInstalledByCurrentUser: false, currentUserRating: null });
  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
