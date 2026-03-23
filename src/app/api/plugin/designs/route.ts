import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";
import { getCachedJson, pluginDesignsCacheKey, setCachedJson } from "@/lib/plugin/pluginDesignsCache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await validatePluginBearer(req);
  if (!auth) return fail("UNAUTHORIZED", "Invalid or expired token", 401);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const platform = (url.searchParams.get("platform") ?? "all").trim().toLowerCase();

  const cacheKey = pluginDesignsCacheKey(auth.userId, page, limit, search, platform);
  const cached = await getCachedJson<{ items: unknown[]; page: number; hasMore: boolean }>(cacheKey);
  if (cached) {
    return ok(cached);
  }

  const where: any = { userId: auth.userId };
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }
  if (platform && platform !== "all") {
    where.platform = platform;
  }

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.design.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit + 1,
      select: {
        id: true,
        title: true,
        platform: true,
        format: true,
        createdAt: true,
        currentVersion: true,
        assets: { take: 1, orderBy: { createdAt: "asc" }, select: { fileUrl: true } },
      },
    }),
    prisma.design.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const items = slice.map((d) => ({
    id: d.id,
    title: d.title,
    platform: d.platform,
    format: d.format,
    createdAt: d.createdAt.toISOString(),
    currentVersion: d.currentVersion,
    previewUrl: d.assets[0]?.fileUrl ?? null,
  }));

  const payload = { items, page, hasMore, total };
  await setCachedJson(cacheKey, payload);
  return ok(payload);
}
