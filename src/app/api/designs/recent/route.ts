import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const cacheKey = `designs:recent:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return ok(JSON.parse(cached));

    const items = await prisma.design.findMany({
      where: { userId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        platform: true,
        format: true,
        status: true,
        originalPrompt: true,
        updatedAt: true,
        createdAt: true,
        currentVersion: true,
        brand: { select: { colors: true } },
        assets: {
          where: { assetType: "preview" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { fileUrl: true },
        },
      },
    });

    const payload = items.map((item) => ({
      ...item,
      previewUrl: item.assets[0]?.fileUrl ?? null,
      brandPrimaryColor: ((item.brand?.colors as any)?.primary as string | undefined) ?? "#6366f1",
      promptSnippet: (item.originalPrompt ?? "").slice(0, 60),
      assets: undefined,
      brand: undefined,
    }));
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 300);
    return ok(payload);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

