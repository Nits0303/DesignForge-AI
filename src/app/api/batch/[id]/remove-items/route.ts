import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { recalculateBatchJobFromItems } from "@/lib/batch/recalculateBatchJob";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({ itemIds: z.array(z.string().min(1)).min(1) });

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await context.params;
    const parsedParams = paramsSchema.safeParse({ id });
    if (!parsedParams.success) return fail("VALIDATION_ERROR", "Invalid batch id", 400);
    const body = await _req.json();
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedBody.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const batchJob = await prisma.batchJob.findFirst({ where: { id: parsedParams.data.id, userId: session.user.id }, select: { id: true } });
    if (!batchJob) return fail("NOT_FOUND", "Batch not found", 404);

    await prisma.batchItem.deleteMany({
      where: { batchJobId: parsedParams.data.id, id: { in: parsedBody.data.itemIds } },
    });

    await recalculateBatchJobFromItems(parsedParams.data.id, session.user.id);

    return ok({ removed: parsedBody.data.itemIds.length });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

