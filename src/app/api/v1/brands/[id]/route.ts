import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withV1Permission(req, "brand:read", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const brand = await prisma.brandProfile.findFirst({
      where: { id, userId: c.userId },
      include: { assets: true },
    });
    if (!brand) {
      const res = v1Error("NOT_FOUND", "Brand not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }
    const res = v1Success({ brand }, requestId, 200, rateHeaders);
    logV1Usage(c, req, requestId, startedAt, 200);
    return res;
  });
}
