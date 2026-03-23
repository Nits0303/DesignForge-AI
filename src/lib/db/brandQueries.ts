import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

const ONE_HOUR_SECONDS = 60 * 60;
const THIRTY_MIN_SECONDS = 60 * 30;

function brandKey(brandId: string) {
  return `brand:${brandId}`;
}

function userBrandsKey(userId: string) {
  return `brands:user:${userId}`;
}

export async function getBrandProfile(brandId: string, userId: string) {
  const cached = await redis.get(brandKey(brandId));
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed?.userId !== userId) return null;
    return parsed;
  }

  const brand = await prisma.brandProfile.findFirst({
    where: { id: brandId, userId },
    include: { assets: true },
  });

  if (!brand) return null;

  await redis.set(brandKey(brandId), JSON.stringify(brand), "EX", ONE_HOUR_SECONDS);
  return brand;
}

export async function getUserBrands(userId: string, includeAssets = false) {
  const key = userBrandsKey(userId) + (includeAssets ? ":assets" : "");
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  /* PERFORMANCE: list brands + optional assets — hot path for workspace; index on BrandProfile(userId) and consider limiting assets join. */
  const brands = await prisma.brandProfile.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    include: includeAssets ? { assets: true } : undefined,
  });

  await redis.set(key, JSON.stringify(brands), "EX", THIRTY_MIN_SECONDS);
  return brands;
}

export async function invalidateBrandCache(brandId: string, userId: string) {
  await redis.del(
    brandKey(brandId),
    userBrandsKey(userId),
    userBrandsKey(userId) + ":assets"
  );
}

