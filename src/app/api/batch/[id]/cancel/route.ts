import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { redis } from "@/lib/redis/client";

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
    if (!["pending", "processing"].includes(batch.status)) return fail("BAD_REQUEST", "Batch cannot be cancelled", 400);

    await redis.set(`batch:cancel:${batch.id}`, "1", "EX", 60 * 60);
    await prisma.batchJob.update({ where: { id: batch.id }, data: { status: "cancelled", completedAt: new Date() } });

    return ok({ cancelled: true });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

