import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { invalidateBrandCache } from "@/lib/db/brandQueries";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;

    const brand = await prisma.brandProfile.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!brand) return fail("NOT_FOUND", "Not found", 404);

    const copy = await prisma.brandProfile.create({
      data: {
        userId: session.user.id,
        name: `${brand.name} (Copy)`,
        industry: brand.industry,
        toneVoice: brand.toneVoice,
        colors: (brand.colors ?? undefined) as any,
        typography: (brand.typography ?? undefined) as any,
        logoPrimaryUrl: brand.logoPrimaryUrl,
        logoIconUrl: brand.logoIconUrl,
        logoDarkUrl: brand.logoDarkUrl,
        isDefault: false,
      },
    });

    await invalidateBrandCache(id, session.user.id);
    return ok(copy, 201);
  } catch (err) {
    console.error("Duplicate error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

