import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import { batchCreateInputSchema, createBatchJobForUser } from "@/lib/batch/createBatchJobForUser";
import { resumeProcessingBatches } from "@/lib/batch/batchProcessor";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withV1Permission(req, "batch:create", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, parseInt(sp.get("limit") ?? "20", 10) || 20);

    const [jobs, total] = await Promise.all([
      prisma.batchJob.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          totalItems: true,
          completedItems: true,
          failedItems: true,
          createdAt: true,
          completedAt: true,
          brandId: true,
        },
      }),
      prisma.batchJob.count({ where: { userId: ctx.userId } }),
    ]);

    const res = v1Success({ jobs, total, page, limit }, requestId, 200, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 200);
    return res;
  });
}

export async function POST(req: NextRequest) {
  return withV1Permission(req, "batch:create", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    const json = await req.json().catch(() => null);
    const parsed = batchCreateInputSchema.safeParse(json);
    if (!parsed.success) {
      const res = v1Error("VALIDATION_ERROR", "Invalid batch payload.", requestId, 400, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 400, { errorCode: "VALIDATION_ERROR" });
      return res;
    }

    void resumeProcessingBatches().catch(() => {});

    const { job, duplicateSkipped } = await createBatchJobForUser({
      userId: ctx.userId,
      input: parsed.data,
    });

    const res = v1Success(
      {
        batchJob: job,
        duplicateSkipped,
        skippedCount: duplicateSkipped.length,
      },
      requestId,
      201,
      rateHeaders
    );
    logV1Usage(ctx, req, requestId, startedAt, 201);
    return res;
  });
}
