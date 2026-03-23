import type { DesignStatus, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runV1Auth, logV1Usage, requirePermission } from "@/lib/auth/apiKeyAuth";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await runV1Auth(req);
  if (!auth.ok) return auth.response;

  const { ctx, requestId, startedAt, rateHeaders } = auth;

  if (!requirePermission(ctx, "design:read")) {
    const res = v1Error(
      "INSUFFICIENT_PERMISSIONS",
      "This API key does not have the 'design:read' permission.",
      requestId,
      403,
      rateHeaders
    );
    logV1Usage(ctx, req, requestId, startedAt, 403, { errorCode: "INSUFFICIENT_PERMISSIONS" });
    return res;
  }

  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, parseInt(sp.get("limit") ?? "20", 10) || 20);
    const platform = sp.get("platform") ?? undefined;
    const status = sp.get("status") ?? undefined;

    const where: Prisma.DesignWhereInput = {
      userId: ctx.userId,
      ...(platform ? { platform } : {}),
      ...(status ? { status: status as DesignStatus } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.design.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          platform: true,
          format: true,
          status: true,
          currentVersion: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.design.count({ where }),
    ]);

    const res = v1Success({ items, total, page, limit }, requestId, 200, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 200);
    return res;
  } catch (e) {
    console.error(e);
    const res = v1Error("INTERNAL_ERROR", "Failed to list designs.", requestId, 500, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 500, { errorCode: "INTERNAL_ERROR" });
    return res;
  }
}
