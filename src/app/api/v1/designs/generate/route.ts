import { NextRequest } from "next/server";
import { streamGenerateDesign } from "@/lib/ai/generationOrchestrator";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import { enqueueApiGenerationJob } from "@/lib/v1/enqueueApiGenerationJob";
import { processApiGenerationJob } from "@/lib/v1/processApiGenerationJob";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return withV1Permission(req, "design:generate", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    let body: {
      prompt?: string;
      brandId?: string;
      projectId?: string;
      synchronous?: boolean;
      webhookUrl?: string;
      platform?: string;
      format?: string;
    };
    try {
      body = await req.json();
    } catch {
      const res = v1Error("VALIDATION_ERROR", "Invalid JSON body.", requestId, 400, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 400, { errorCode: "VALIDATION_ERROR" });
      return res;
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 4) {
      const res = v1Error("VALIDATION_ERROR", "prompt is required (min 4 characters).", requestId, 400, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 400, { errorCode: "VALIDATION_ERROR" });
      return res;
    }

    let brandId = body.brandId;
    if (!brandId) {
      const def = await prisma.brandProfile.findFirst({
        where: { userId: ctx.userId, isDefault: true },
        select: { id: true },
      });
      const any = def ?? (await prisma.brandProfile.findFirst({
        where: { userId: ctx.userId },
        select: { id: true },
      }));
      brandId = any?.id;
    }
    if (!brandId) {
      const res = v1Error(
        "BRAND_REQUIRED",
        "No brand profile found — create one in the app or pass brandId.",
        requestId,
        400,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 400, { errorCode: "BRAND_REQUIRED" });
      return res;
    }

    const brand = await prisma.brandProfile.findFirst({
      where: { id: brandId, userId: ctx.userId },
      select: { id: true },
    });
    if (!brand) {
      const res = v1Error(
        "BRAND_NOT_FOUND",
        "The brandId does not exist or you do not have access to it.",
        requestId,
        404,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 404, { errorCode: "BRAND_NOT_FOUND" });
      return res;
    }

    const synchronous = body.synchronous === true;

    if (!synchronous) {
      const { jobId } = await enqueueApiGenerationJob({
        userId: ctx.userId,
        apiKeyId: ctx.apiKeyId,
        clientRequestId: requestId,
        input: { prompt, brandId, projectId: body.projectId },
      });
      void processApiGenerationJob(jobId).catch(() => {});
      const res = v1Success(
        {
          jobId,
          status: "queued",
          pollUrl: `/api/v1/jobs/generation/${jobId}`,
          message: "Generation queued. Poll GET /api/v1/jobs/generation/{jobId} until status is complete or failed.",
        },
        requestId,
        202,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 202);
      return res;
    }

    try {
      const result = await streamGenerateDesign(
        {
          userId: ctx.userId,
          brandId,
          projectId: body.projectId,
          prompt,
        },
        {}
      );

      const res = v1Success(
        {
          designId: result.designId,
          status: "complete",
          versionNumber: result.versionNumber,
          model: result.model,
          totalTokens: result.totalTokens,
          costUsd: result.costUsd,
          generationTimeMs: result.generationTimeMs,
          htmlPreview: result.finalHtml.slice(0, 8000),
        },
        requestId,
        200,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 200, {
        requestTokens: result.totalTokens,
        costUsd: result.costUsd,
      });
      return res;
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Generation failed";
      const res = v1Error("GENERATION_FAILED", msg.slice(0, 400), requestId, 500, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 500, { errorCode: "GENERATION_FAILED" });
      return res;
    }
  });
}
