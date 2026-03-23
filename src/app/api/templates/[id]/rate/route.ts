import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { getRequiredSession } from "@/lib/auth/session";
import { recomputeTemplateMarketplaceRating } from "@/lib/marketplace/templateRatingAggregate";
import { invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id: templateId } = await ctx.params;
    const body = (await req.json()) as { rating?: number; reviewText?: string | null; generationId?: string | null };

    const inst = await prisma.templateInstallation.findFirst({
      where: { userId: session.user.id, templateId, isActive: true },
    });
    if (!inst) {
      return fail("FORBIDDEN", "Install the template before rating", 403);
    }

    const rating = Math.min(5, Math.max(1, Math.floor(Number(body.rating ?? 0))));
    if (!rating) return fail("VALIDATION_ERROR", "rating 1-5 required", 400);

    const reviewText =
      typeof body.reviewText === "string" ? body.reviewText.slice(0, 500) : null;

    const row = await prisma.templateRating.upsert({
      where: { userId_templateId: { userId: session.user.id, templateId } },
      create: {
        userId: session.user.id,
        templateId,
        rating,
        reviewText,
        generationId: body.generationId ?? null,
      },
      update: { rating, reviewText, generationId: body.generationId ?? null },
    });

    await recomputeTemplateMarketplaceRating(templateId);
    await redis.del(`marketplace:detail:${templateId}`);
    await invalidateMarketplaceListCache();
    return ok({ rating: row }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Rate failed", 500);
  }
}
