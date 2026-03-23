import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await ctx.params;
    const tpl = await prisma.template.findFirst({
      where: { id },
      include: {
        contributor: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } },
      },
    });
    if (!tpl) return fail("NOT_FOUND", "Template not found", 404);
    return ok({ template: tpl }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
