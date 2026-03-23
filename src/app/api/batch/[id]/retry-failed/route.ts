import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { redis } from "@/lib/redis/client";
import { processBatchJob } from "@/lib/batch/batchProcessor";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await context.params;
    const parsed = paramsSchema.safeParse({ id });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid batch id", 400);

    const batch = await prisma.batchJob.findFirst({ where: { id: parsed.data.id, userId: session.user.id } });
    if (!batch) return fail("NOT_FOUND", "Batch not found", 404);
    if (!["partial", "failed"].includes(batch.status)) return fail("BAD_REQUEST", "Only partial/failed batches can be retried", 400);

    await redis.del(`batch:cancel:${batch.id}`);

    await prisma.batchItem.updateMany({
      where: { batchJobId: batch.id, status: "failed" },
      data: { status: "pending", errorMessage: null, revisionPrompt: null, designId: null },
    });

    await prisma.batchJob.update({
      where: { id: batch.id },
      data: { status: "processing", startedAt: batch.startedAt ?? new Date() },
    });

    void processBatchJob(batch.id).catch(() => {});

    return ok({ retried: true });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

