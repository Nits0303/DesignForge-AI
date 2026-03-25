import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  label: z.string().trim().min(1).max(60),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string; num: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id, num } = await context.params;
    const versionNumber = Number(num);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      return fail("VALIDATION_ERROR", "Invalid version number", 400);
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const design = await prisma.design.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!design) return fail("NOT_FOUND", "Design not found", 404);

    const version = await prisma.designVersion.findFirst({
      where: { designId: id, versionNumber, deletedAt: null },
      select: { id: true },
    });
    if (!version) return fail("NOT_FOUND", "Version not found", 404);

    const updated = await prisma.designVersion.update({
      where: { id: version.id },
      data: { label: parsed.data.label },
      select: { id: true, versionNumber: true, label: true },
    });

    return ok(updated);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

