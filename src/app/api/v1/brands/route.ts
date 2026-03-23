import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withV1Permission(req, "brand:read", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    const brands = await prisma.brandProfile.findMany({
      where: { userId: ctx.userId, teamId: null },
      select: {
        id: true,
        name: true,
        colors: true,
        typography: true,
        toneVoice: true,
        industry: true,
        isDefault: true,
        createdAt: true,
      },
    });
    const res = v1Success({ brands }, requestId, 200, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 200);
    return res;
  });
}
