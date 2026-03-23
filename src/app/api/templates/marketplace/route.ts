import { NextRequest } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { ok, fail } from "@/lib/api/response";
import type { Prisma as PrismaTypes } from "@prisma/client";

export const runtime = "nodejs";

const CACHE_TTL = 60 * 10;

function cacheKeyFromSearchParams(sp: URLSearchParams): string {
  const h = crypto.createHash("sha256").update(sp.toString()).digest("hex").slice(0, 32);
  return `marketplace:list:${h}`;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(parseInt(sp.get("limit") ?? "24", 10) || 24, 48);
    const platform = sp.get("platform") ?? undefined;
    const category = sp.get("category") ?? undefined;
    const tags = (sp.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const search = sp.get("search")?.trim() ?? undefined;
    const sort = sp.get("sort") ?? "popular";
    const minRating = sp.get("minRating") ? parseFloat(sp.get("minRating")!) : undefined;
    const contributor = sp.get("contributor") ?? "all";
    const license = sp.get("license") ?? undefined;

    const ck = cacheKeyFromSearchParams(sp);
    const cached = await redis.get(ck);
    if (cached) {
      return ok(JSON.parse(cached));
    }

    const andParts: PrismaTypes.TemplateWhereInput[] = [];

    if (platform && platform !== "all") {
      andParts.push({ OR: [{ platform }, { platform: "all" }] });
    }
    if (category && category !== "all") {
      andParts.push({ category });
    }
    if (tags.length) {
      andParts.push({ tags: { hasSome: tags } });
    }
    if (search) {
      let ftsIds: string[] | null = null;
      try {
        const raw = await prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`
            SELECT id FROM "Template"
            WHERE "isActive" = true AND "submissionStatus" = 'approved'
            AND "marketplaceQualityFlagged" = false
            AND "search_vector" @@ plainto_tsquery('english', ${search})
          `
        );
        ftsIds = raw.map((r) => r.id);
      } catch {
        ftsIds = null;
      }
      if (ftsIds) {
        if (ftsIds.length === 0) {
          const payload = { items: [], total: 0, page, limit };
          await redis.set(ck, JSON.stringify(payload), "EX", CACHE_TTL);
          return ok(payload);
        }
        andParts.push({ id: { in: ftsIds } });
      } else {
        andParts.push({
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { marketplaceDescription: { contains: search, mode: "insensitive" } },
            { tags: { has: search.toLowerCase() } },
          ],
        });
      }
    }
    if (minRating != null && !Number.isNaN(minRating)) {
      andParts.push({ avgMarketplaceRating: { gte: minRating } });
    }
    if (contributor === "community") {
      andParts.push({ contributorUserId: { not: null } });
    }
    if (contributor === "system") {
      andParts.push({ contributorUserId: null });
    }
    if (license && license !== "all") {
      andParts.push({
        licenseType: license as "mit" | "cc_by" | "cc_by_nc" | "proprietary",
      });
    }

    const where: PrismaTypes.TemplateWhereInput = {
      isActive: true,
      submissionStatus: "approved",
      marketplaceQualityFlagged: false,
      ...(andParts.length ? { AND: andParts } : {}),
    };

    let orderBy: PrismaTypes.TemplateOrderByWithRelationInput[] = [{ isMarketplaceFeatured: "desc" }];
    if (sort === "rated") {
      orderBy.push({ avgMarketplaceRating: "desc" });
    } else if (sort === "newest") {
      orderBy.push({ createdAt: "desc" });
    } else if (sort === "used") {
      orderBy.push({ usageCount: "desc" });
    } else {
      orderBy.push({ installCount: "desc" });
    }

    const [rows, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contributor: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } },
        },
      }),
      prisma.template.count({ where }),
    ]);

    const items = rows.map((t) => ({
      ...t,
      avgRating: t.avgMarketplaceRating,
      ratingCount: t.marketplaceRatingCount,
      usageCountDesigns: t.usageCount,
    }));

    const payload = { items, total, page, limit };
    await redis.set(ck, JSON.stringify(payload), "EX", CACHE_TTL);
    return ok(payload);
  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", "Marketplace error", 500);
  }
}
