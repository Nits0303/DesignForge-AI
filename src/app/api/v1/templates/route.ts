import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withV1Permission(req, "templates:read", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    const sp = req.nextUrl.searchParams;
    const platform = sp.get("platform") ?? undefined;
    const category = sp.get("category") ?? undefined;
    const search = sp.get("search")?.trim() ?? undefined;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(48, parseInt(sp.get("limit") ?? "24", 10) || 24);

    const where: Prisma.TemplateWhereInput = {
      isActive: true,
      submissionStatus: "approved",
      marketplaceQualityFlagged: false,
      ...(platform && platform !== "all" ? { OR: [{ platform }, { platform: "all" }] } : {}),
      ...(category && category !== "all" ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { marketplaceDescription: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: { installCount: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          platform: true,
          category: true,
          format: true,
          tags: true,
          previewUrl: true,
          installCount: true,
          avgMarketplaceRating: true,
          marketplaceRatingCount: true,
          licenseType: true,
        },
      }),
      prisma.template.count({ where }),
    ]);

    const res = v1Success({ items, total, page, limit }, requestId, 200, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 200);
    return res;
  });
}
