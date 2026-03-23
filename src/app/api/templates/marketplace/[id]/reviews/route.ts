import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: templateId } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const sort = sp.get("sort") ?? "rating";
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, parseInt(sp.get("limit") ?? "20", 10) || 20);

    const tpl = await prisma.template.findFirst({
      where: { id: templateId, submissionStatus: "approved", isActive: true, marketplaceQualityFlagged: false },
      select: { id: true },
    });
    if (!tpl) return fail("NOT_FOUND", "Template not found", 404);

    const orderBy =
      sort === "recent"
        ? ({ createdAt: "desc" as const } as const)
        : ({ rating: "desc" as const } as const);

    const [rows, total] = await Promise.all([
      prisma.templateRating.findMany({
        where: { templateId },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      prisma.templateRating.count({ where: { templateId } }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      reviewText: r.reviewText,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      generationId: r.generationId,
      reviewer: r.user,
      usedInDesign: !!r.generationId,
    }));

    return ok({ items, total, page, limit }, 200);
  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
