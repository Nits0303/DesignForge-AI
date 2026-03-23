import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import { v1Headers } from "@/lib/api/v1/envelope";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const versionParam = req.nextUrl.searchParams.get("version");

  return withV1Permission(req, "design:read", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const design = await prisma.design.findFirst({
      where: { id, userId: c.userId },
      select: { id: true, currentVersion: true },
    });
    if (!design) {
      const res = v1Error("NOT_FOUND", "Design not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const vn = versionParam ? parseInt(versionParam, 10) : design.currentVersion;
    const ver = await prisma.designVersion.findFirst({
      where: { designId: id, versionNumber: vn },
      select: { htmlContent: true },
    });
    if (!ver) {
      const res = v1Error("NOT_FOUND", "Version not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    logV1Usage(c, req, requestId, startedAt, 200);
    return new NextResponse(ver.htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...Object.fromEntries(
          Object.entries(v1Headers(requestId, rateHeaders)).filter(([, v]) => v !== "")
        ),
      },
    });
  });
}
