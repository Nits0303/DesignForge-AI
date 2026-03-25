import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(_req: Request, context: { params: Promise<{ id: string; num: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id, num } = await context.params;
    const versionNumber = Number(num);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      return fail("VALIDATION_ERROR", "Invalid version number", 400);
    }

    const design = await prisma.design.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!design) return fail("NOT_FOUND", "Design not found", 404);

    const version = await prisma.designVersion.findFirst({
      where: { designId: id, versionNumber },
      select: { id: true, deletedAt: true },
    });
    if (!version) return fail("NOT_FOUND", "Version not found", 404);

    if (!version.deletedAt) {
      return ok({ restored: false, versionNumber });
    }

    const updated = await prisma.designVersion.update({
      where: { id: version.id },
      data: { deletedAt: null },
      select: { id: true, versionNumber: true, deletedAt: true },
    });

    return ok({ restored: true, version: updated });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

