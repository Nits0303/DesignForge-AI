import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

/** Marks template as under review by this admin and records claim time for stale reset. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminUser();
    const { id } = await ctx.params;

    const tpl = await prisma.template.findFirst({
      where: {
        id,
        submissionStatus: { in: ["submitted", "under_review"] },
      },
    });
    if (!tpl) return fail("NOT_FOUND", "Template not in review queue", 404);

    const updated = await prisma.template.update({
      where: { id },
      data: {
        submissionStatus: "under_review",
        reviewingAdminUserId: userId,
        reviewClaimedAt: new Date(),
      } as any,
    });

    return ok({ template: updated }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
