import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const CACHE_SECONDS = 60 * 10;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const tier = searchParams.get("tier") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const platform = searchParams.get("platform") ?? undefined;
    const tagsParam = searchParams.get("tags") ?? "";
    const search = searchParams.get("search") ?? undefined;
    const page = parseInt(searchParams.get("page") ?? "1", 10) || 1;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 50);
    const sort = searchParams.get("sort") ?? "created_at";

    const tags = tagsParam
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const cacheKey = `templates:list:${tier ?? "any"}:${category ?? "any"}:${platform ?? "any"}:${
      tags.join("|") || "any"
    }:${search ?? "any"}:${page}:${limit}:${sort}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return ok(JSON.parse(cached));
    }

    const where: any = { isActive: true, submissionStatus: "approved" };
    if (tier) where.tier = tier;
    if (category) where.category = category;
    if (platform) where.platform = platform;
    if (tags.length) {
      where.tags = { hasSome: tags };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { tags: { has: search.toLowerCase() } },
      ];
    }

    const orderBy =
      sort === "usage_count"
        ? { usageCount: "desc" as const }
        : sort === "approval_rate"
        ? { avgApprovalRate: "desc" as const }
        : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.template.count({ where }),
    ]);

    const result = {
      items,
      total,
      page,
      limit,
    };

    await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_SECONDS);

    return ok(result);
  } catch (err) {
    console.error("Error in GET /api/templates", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

