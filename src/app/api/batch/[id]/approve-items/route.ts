import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { recalculateBatchJobFromItems } from "@/lib/batch/recalculateBatchJob";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({
  itemIds: z.array(z.string().min(1)).optional(),
  approveAll: z.boolean().optional(),
});

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await context.params;
    const parsedParams = paramsSchema.safeParse({ id });
    if (!parsedParams.success) return fail("VALIDATION_ERROR", "Invalid batch id", 400);

    const body = await _req.json().catch(() => ({}));
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedBody.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const batchJobId = parsedParams.data.id;

    const batch = await prisma.batchJob.findFirst({
      where: { id: batchJobId, userId: session.user.id },
      select: { id: true },
    });
    if (!batch) return fail("NOT_FOUND", "Batch not found", 404);

    const { itemIds, approveAll } = parsedBody.data;
    const where: any = { batchJobId };
    if (itemIds?.length) where.id = { in: itemIds };
    else if (approveAll) where.status = { in: ["complete", "revision_requested"] };
    else where.status = { in: ["complete", "revision_requested"] };

    const items = await prisma.batchItem.findMany({
      where,
      select: { id: true, designId: true },
    });

    const designIds = items.filter((i) => !!i.designId).map((i) => i.designId as string);
    if (!designIds.length) return ok({ approved: 0 });

    await prisma.$transaction([
      prisma.batchItem.updateMany({
        where: { id: { in: items.map((x) => x.id) } },
        data: { status: "approved", revisionPrompt: null },
      }),
      prisma.design.updateMany({ where: { id: { in: designIds } }, data: { status: "approved" } }),
      prisma.generationLog.updateMany({ where: { designId: { in: designIds } }, data: { wasApproved: true } }),
    ]);

    await recalculateBatchJobFromItems(batchJobId, session.user.id);
    return ok({ approved: items.length });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

