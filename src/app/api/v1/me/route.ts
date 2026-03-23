import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runV1Auth, logV1Usage } from "@/lib/auth/apiKeyAuth";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await runV1Auth(req);
  if (!auth.ok) return auth.response;

  const { ctx, requestId, startedAt, rateHeaders } = auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });
    if (!user) {
      const res = v1Error("NOT_FOUND", "User not found.", requestId, 404, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const res = v1Success(
      {
        user,
        apiKey: {
          id: ctx.apiKeyId,
          name: ctx.apiKeyRow.name,
          permissions: ctx.permissions,
          rateLimitTier: ctx.rateLimitTier,
        },
      },
      requestId,
      200,
      rateHeaders
    );
    logV1Usage(ctx, req, requestId, startedAt, 200);
    return res;
  } catch (e) {
    console.error(e);
    const res = v1Error("INTERNAL_ERROR", "Server error.", requestId, 500, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 500, { errorCode: "INTERNAL_ERROR" });
    return res;
  }
}
