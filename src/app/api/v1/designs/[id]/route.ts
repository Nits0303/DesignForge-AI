import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withV1Permission(req, "design:read", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const design = await prisma.design.findFirst({
      where: { id, userId: c.userId },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 5, select: { versionNumber: true, createdAt: true } },
      },
    });
    if (!design) {
      const res = v1Error("NOT_FOUND", "Design not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const res = v1Success(
      {
        id: design.id,
        title: design.title,
        platform: design.platform,
        format: design.format,
        status: design.status,
        currentVersion: design.currentVersion,
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
        recentVersions: design.versions,
      },
      requestId,
      200,
      rateHeaders
    );
    logV1Usage(c, req, requestId, startedAt, 200);
    return res;
  });
}
