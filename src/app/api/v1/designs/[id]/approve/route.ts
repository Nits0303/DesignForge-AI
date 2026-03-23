import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withV1Permission(req, "design:approve", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const design = await prisma.design.findFirst({
      where: { id, userId: c.userId },
    });
    if (!design) {
      const res = v1Error("NOT_FOUND", "Design not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const updated = await prisma.design.update({
      where: { id },
      data: { status: "approved" },
    });

    const res = v1Success(
      {
        id: updated.id,
        status: updated.status,
      },
      requestId,
      200,
      rateHeaders
    );
    logV1Usage(c, req, requestId, startedAt, 200);
    return res;
  });
}
