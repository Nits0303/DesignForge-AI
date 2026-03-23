import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  return withV1Permission(req, "design:export", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const job = await prisma.exportJob.findFirst({
      where: {
        id: jobId,
        design: { userId: c.userId },
      },
      include: {
        design: { select: { id: true } },
      },
    });

    if (!job) {
      const res = v1Error("NOT_FOUND", "Export job not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const res = v1Success(
      {
        id: job.id,
        designId: job.designId,
        versionNumber: job.versionNumber,
        format: job.format,
        status: job.status,
        resultUrl: job.resultUrl,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      requestId,
      200,
      rateHeaders
    );
    logV1Usage(c, req, requestId, startedAt, 200);
    return res;
  });
}
