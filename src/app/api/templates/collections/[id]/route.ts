import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Public collection detail — skips missing / non-approved template IDs. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const col = await prisma.templateCollection.findFirst({
      where: { id, isPublic: true },
      include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
    });
    if (!col) return fail("NOT_FOUND", "Collection not found", 404);

    const ids = Array.isArray(col.templateIds) ? (col.templateIds as string[]) : [];
    if (ids.length === 0) {
      return ok({ collection: col, templates: [] }, 200);
    }

    const templates = await prisma.template.findMany({
      where: {
        id: { in: ids },
        submissionStatus: "approved",
        isActive: true,
      },
      include: {
        contributor: { select: { id: true, name: true, avatarUrl: true, contributorTrusted: true } },
      },
    });
    const byId = new Map(templates.map((t) => [t.id, t]));
    const ordered = ids.map((tid) => byId.get(tid)).filter(Boolean) as typeof templates;

    return ok({ collection: col, templates: ordered }, 200);
  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
