import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withV1Permission(req, "design:generate", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const job = await prisma.apiGenerationJob.findFirst({
      where: { id, userId: c.userId },
    });
    if (!job) {
      const res = v1Error("NOT_FOUND", "Generation job not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const res = v1Success(
      {
        id: job.id,
        status: job.status,
        resultDesignId: job.resultDesignId,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
      requestId,
      200,
      rateHeaders
    );
    logV1Usage(c, req, requestId, startedAt, 200);
    return res;
  });
}
