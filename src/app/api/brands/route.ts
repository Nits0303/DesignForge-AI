import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { getUserBrands, invalidateBrandCache } from "@/lib/db/brandQueries";

export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().min(1, "Name is required"),
  industry: z.string().nullish(),
  toneVoice: z.string().nullish(),
  colors: z.any().optional(),
  typography: z.any().optional(),
  logoPrimaryUrl: z.string().nullish(),
  logoIconUrl: z.string().nullish(),
  logoDarkUrl: z.string().nullish(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const url = new URL(req.url);
    const includeAssets = url.searchParams.get("includeAssets") === "true";

    const brands = await getUserBrands(session.user.id, includeAssets);

    const withCounts = await Promise.all(
      (brands as any[]).map(async (b: any) => ({
        ...b,
        designCount: await prisma.design.count({ where: { brandId: b.id } }),
      }))
    );

    return ok(withCounts);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    console.error("Brands GET error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e: { message: string }) => e.message).join("; ");
      return fail("VALIDATION_ERROR", msg, 400);
    }

    const data = parsed.data;
    const count = await prisma.brandProfile.count({ where: { userId: session.user.id } });

    const brand = await prisma.brandProfile.create({
      data: {
        userId: session.user.id,
        name: data.name,
        industry: data.industry ?? null,
        toneVoice: data.toneVoice ?? null,
        colors: data.colors ?? undefined,
        typography: data.typography ?? undefined,
        logoPrimaryUrl: data.logoPrimaryUrl ?? null,
        logoIconUrl: data.logoIconUrl ?? null,
        logoDarkUrl: data.logoDarkUrl ?? null,
        isDefault: count === 0,
      },
    });

    await invalidateBrandCache(brand.id, session.user.id);
    return ok(brand, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    console.error("Brands POST error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
