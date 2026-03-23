import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { redis } from "@/lib/redis/client";
import {
  exportBatchZip,
  type BulkFilenameConvention,
  type BulkExportFormatMode,
  type BulkExportKind,
} from "@/lib/export/bulkExporter";
import crypto from "crypto";

export const runtime = "nodejs";

const bodySchema = z.object({
  batchJobId: z.string().min(1),
  exportKind: z.enum(["mixed", "image", "pdf", "code", "figma"]).default("mixed"),
  formatMode: z.enum(["png", "jpg", "mixed"]).default("mixed"),
  itemIds: z.array(z.string().min(1)).optional(),
  jpgQuality: z.coerce.number().min(10).max(100).optional(),
  filenameConvention: z.enum(["by_platform", "by_date", "all_in_one"]).default("by_platform"),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const { batchJobId, formatMode, exportKind, filenameConvention } = parsed.data;
    const jpgQuality = parsed.data.jpgQuality ?? 90;
    const itemIds = parsed.data.itemIds;

    const batchJob = await prisma.batchJob.findFirst({
      where: { id: batchJobId, userId: session.user.id },
      select: { id: true, name: true, userId: true },
    });
    if (!batchJob) return fail("NOT_FOUND", "Batch not found", 404);

    const items = await prisma.batchItem.findMany({
      where: {
        batchJobId,
        status: "approved",
        ...(itemIds?.length ? { id: { in: itemIds } } : {}),
      },
      orderBy: { itemIndex: "asc" },
      select: {
        id: true,
        itemIndex: true,
        topic: true,
        date: true,
        platform: true,
        format: true,
        designId: true,
        design: { select: { currentVersion: true } },
      },
    });

    const exportItems = items
      .filter((it) => !!it.designId)
      .map((it) => ({
        designId: it.designId as string,
        versionNumber: it.design?.currentVersion ?? 1,
        topic: it.topic,
        date: it.date,
        platform: it.platform,
        format: it.format,
      }));

    if (!exportItems.length) return fail("BAD_REQUEST", "No approved items to export", 400);

    const jobId = crypto.randomUUID();
    const key = `bulk_export:${jobId}`;

    await redis.set(
      key,
      JSON.stringify({
        status: "processing",
        processed: 0,
        total: exportItems.length,
        currentDesignTitle: "",
        zipUrl: null,
        errorMessage: null,
      }),
      "EX",
      60 * 60
    );

    void exportBatchZip({
      batchJob,
      items: exportItems as any,
      exportKind: exportKind as BulkExportKind,
      formatMode: formatMode as BulkExportFormatMode,
      jpgQuality,
      filenameConvention: filenameConvention as BulkFilenameConvention,
      onProgress: async ({ processed, total, currentDesignTitle }) => {
        await redis.set(
          key,
          JSON.stringify({
            status: "processing",
            processed,
            total,
            currentDesignTitle,
            zipUrl: null,
            errorMessage: null,
          }),
          "EX",
          60 * 60
        );
      },
    })
      .then(async ({ zipUrl }) => {
        await redis.set(
          key,
          JSON.stringify({ status: "complete", processed: exportItems.length, total: exportItems.length, currentDesignTitle: "done", zipUrl, errorMessage: null }),
          "EX",
          60 * 60
        );
      })
      .catch(async (err) => {
        await redis.set(
          key,
          JSON.stringify({ status: "failed", processed: 0, total: exportItems.length, currentDesignTitle: "", zipUrl: null, errorMessage: err?.message ? String(err.message) : "Export failed" }),
          "EX",
          60 * 60
        );
      });

    return ok({ jobId, total: exportItems.length }, 201);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

