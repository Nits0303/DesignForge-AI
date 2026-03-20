import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { invalidateBrandCache } from "@/lib/db/brandQueries";

export const runtime = "nodejs";

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;

    const brand = await prisma.brandProfile.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!brand) return fail("NOT_FOUND", "Not found", 404);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.brandProfile.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
      return tx.brandProfile.update({
        where: { id: brand.id },
        data: { isDefault: true },
      });
    });

    await invalidateBrandCache(id, session.user.id);
    return ok(updated);
  } catch (err) {
    console.error("Set default error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

