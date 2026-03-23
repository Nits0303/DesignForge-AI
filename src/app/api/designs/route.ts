import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const platform = searchParams.get("platform") || undefined;
    const status = searchParams.get("status") || undefined;
    const projectId = searchParams.get("projectId") || undefined;
    const search = searchParams.get("search") || undefined;
    const sort = searchParams.get("sort") || "newest";
    const dateRange = searchParams.get("dateRange") || "all";

    const cacheKey = `designs:list:${userId}:${page}:${limit}:${platform ?? ""}:${status ?? ""}:${projectId ?? ""}:${search ?? ""}:${sort}:${dateRange}`;
    const cached = await redis.get(cacheKey);
    if (cached) return ok(JSON.parse(cached));

    const where: any = { userId };
    if (platform) where.platform = platform;
    if (status) where.status = status;
    else where.status = { not: "archived" };
    if (projectId) where.projectId = projectId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { originalPrompt: { contains: search, mode: "insensitive" } },
      ];
    }
    if (dateRange !== "all") {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 0;
      if (days > 0) {
        where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
      }
    }

    const orderBy =
      sort === "oldest"
        ? [{ createdAt: "asc" as const }]
        : sort === "most_revised"
        ? [{ currentVersion: "desc" as const }, { updatedAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

    const [items, total] = await Promise.all([
      prisma.design.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          platform: true,
          format: true,
          status: true,
          originalPrompt: true,
          createdAt: true,
          updatedAt: true,
          currentVersion: true,
          tags: true,
          brand: { select: { colors: true } },
          assets: {
            where: { assetType: "preview" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { fileUrl: true },
          },
        },
      }),
      prisma.design.count({ where }),
    ]);

    const payload = {
      items: items.map((item) => ({
        ...item,
        previewUrl: item.assets[0]?.fileUrl ?? null,
        brandPrimaryColor: ((item.brand?.colors as any)?.primary as string | undefined) ?? "#6366f1",
        promptSnippet: (item.originalPrompt ?? "").slice(0, 60),
        assets: undefined,
        brand: undefined,
      })),
      total,
      page,
      limit,
    };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 120);
    return ok(payload);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

