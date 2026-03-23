import { NextRequest } from "next/server";
import { reviseDesign } from "@/lib/ai/generationOrchestrator";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: designId } = await ctx.params;
  return withV1Permission(req, "design:revise", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    let body: { revisionPrompt?: string; slideIndex?: number; referenceImageUrl?: string };
    try {
      body = await req.json();
    } catch {
      const res = v1Error("VALIDATION_ERROR", "Invalid JSON body.", requestId, 400, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 400, { errorCode: "VALIDATION_ERROR" });
      return res;
    }

    const revisionPrompt = typeof body.revisionPrompt === "string" ? body.revisionPrompt.trim() : "";
    if (revisionPrompt.length < 2) {
      const res = v1Error("VALIDATION_ERROR", "revisionPrompt is required.", requestId, 400, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 400, { errorCode: "VALIDATION_ERROR" });
      return res;
    }

    const exists = await prisma.design.findFirst({
      where: { id: designId, userId: c.userId },
      select: { id: true },
    });
    if (!exists) {
      const res = v1Error("NOT_FOUND", "Design not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    try {
      const result = await reviseDesign({
        userId: c.userId,
        designId,
        revisionPrompt,
        slideIndex: body.slideIndex,
        referenceImageUrl: body.referenceImageUrl,
      });

      void enqueueExportJob({
        designId,
        versionNumber: result.versionNumber,
        format: "thumbnail",
      }).catch(() => {});

      const res = v1Success(
        {
          designId,
          versionNumber: result.versionNumber,
          versionId: result.versionId,
          model: result.model,
          generationTimeMs: result.generationTimeMs,
          htmlPreview: result.html.slice(0, 8000),
        },
        requestId,
        200,
        rateHeaders
      );
      logV1Usage(c, req, requestId, startedAt, 200);
      return res;
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Revision failed";
      const res = v1Error("REVISION_FAILED", msg.slice(0, 400), requestId, 500, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 500, { errorCode: "REVISION_FAILED" });
      return res;
    }
  });
}
