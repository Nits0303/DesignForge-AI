import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id: designId } = await context.params;

    const design = await prisma.design.findFirst({
      where: { id: designId, userId },
      select: { id: true, status: true },
    });
    if (!design) {
      return fail("NOT_FOUND", "Design not found", 404);
    }
    if (design.status !== "preview") {
      return fail("INVALID_STATUS", "Design must be in preview status to approve", 409);
    }

    await prisma.design.update({
      where: { id: designId },
      data: { status: "approved" },
    });

    // async: update template approval rates
    setTimeout(async () => {
      try {
        const logs = await prisma.generationLog.findMany({
          where: { designId },
          select: { templateIdsUsed: true },
        });
        const templateIds = Array.from(
          new Set(logs.flatMap((l) => l.templateIdsUsed))
        ).filter(Boolean);
        if (!templateIds.length) return;

        const totals = await prisma.generationLog.groupBy({
          by: ["templateIdsUsed"],
          _count: { _all: true },
          where: { templateIdsUsed: { hasSome: templateIds } },
        });
        // Simple heuristic: bump approval rate slightly for all templates used
        await prisma.template.updateMany({
          where: { id: { in: templateIds } },
          data: {
            avgApprovalRate: {
              increment: 0.02,
            },
          },
        });
      } catch (err) {
        console.error("Failed to update template approval rates", err);
      }
    }, 0);

    return ok({ id: designId, status: "approved" });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    console.error("Error in POST /api/design/[id]/approve", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

