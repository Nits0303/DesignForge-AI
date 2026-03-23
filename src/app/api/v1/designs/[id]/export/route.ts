import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  format: z.enum(["png", "jpg", "pdf", "html_css", "figma_bridge"]),
  version: z.number().int().min(1).optional(),
  quality: z.number().int().min(80).max(100).optional(),
  pageFormat: z.enum(["A4", "A3", "Letter"]).optional(),
  landscape: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: designId } = await ctx.params;
  return withV1Permission(req, "design:export", async ({ ctx: c, requestId, startedAt, rateHeaders }) => {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const res = v1Error("VALIDATION_ERROR", "Invalid export body (format required).", requestId, 400, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 400, { errorCode: "VALIDATION_ERROR" });
      return res;
    }

    const design = await prisma.design.findFirst({
      where: { id: designId, userId: c.userId },
      select: { id: true, currentVersion: true },
    });
    if (!design) {
      const res = v1Error("NOT_FOUND", "Design not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const versionNumber = parsed.data.version ?? design.currentVersion;
    const ver = await prisma.designVersion.findUnique({
      where: { designId_versionNumber: { designId, versionNumber } },
    });
    if (!ver) {
      const res = v1Error("NOT_FOUND", "Design version not found.", requestId, 404, rateHeaders);
      logV1Usage(c, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    const { format, quality, pageFormat, landscape } = parsed.data;
    let jobFormat: string;
    if (format === "png" || format === "jpg") {
      const q = quality ?? 90;
      jobFormat = `${format}|q=${q}`;
    } else if (format === "pdf") {
      const pf = pageFormat ?? "A4";
      const ls = landscape ? "landscape" : "portrait";
      jobFormat = `pdf|${pf}|${ls}`;
    } else {
      jobFormat = format;
    }

    const { jobId } = await enqueueExportJob({ designId, versionNumber, format: jobFormat });

    const res = v1Success(
      {
        jobId,
        status: "pending",
        pollUrl: `/api/v1/exports/${jobId}/status`,
        format: jobFormat,
      },
      requestId,
      202,
      rateHeaders
    );
    logV1Usage(c, req, requestId, startedAt, 202);
    return res;
  });
}
