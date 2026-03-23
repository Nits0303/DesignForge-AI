import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: z.enum(["applied", "dismissed"]),
});

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const params = await context.params;
    const id = params.id?.toString();
    if (!id || id.length < 1) return fail("VALIDATION_ERROR", "Invalid id", 400);

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const existing = await prisma.templateRecommendation.findUnique({ where: { id } });
    if (!existing) return fail("NOT_FOUND", "Recommendation not found", 404);

    const updated = await prisma.templateRecommendation.update({
      where: { id },
      data: { status: parsed.data.status as any },
    });

    return ok({ id: updated.id, status: updated.status }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

