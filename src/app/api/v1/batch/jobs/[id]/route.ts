import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withV1Permission(req, "batch:create", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const job = await prisma.batchJob.findFirst({
      where: { id, userId: c.userId },
      include: {
        items: {
          orderBy: { itemIndex: "asc" },
          select: {
            id: true,
            itemIndex: true,
            topic: true,
            date: true,
            platform: true,
            format: true,
            status: true,
            designId: true,
            errorMessage: true,
          },
        },
      },
    });

    if (!job) {
      const res = v1Error("NOT_FOUND", "Batch job not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const res = v1Success({ job }, requestId, 200, rateHeaders);
    logV1Usage(c, req, requestId, startedAt, 200);
    return res;
  });
}
