import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { processBatchJob } from "@/lib/batch/batchProcessor";
import {
  parseContentCalendarFromCsv,
  estimateBatchCostUsd,
  type BatchItemInput,
} from "@/lib/batch/contentCalendarParser";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  brandId: z.string().optional(),
  processingStrategy: z.enum(["anthropic_batch", "sequential", "parallel"]),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const form = await req.formData();

    const file = form.get("file");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return fail("VALIDATION_ERROR", "Missing CSV file", 400);
    }

    const name = String(form.get("name") ?? "");
    const brandId = form.get("brandId") ? String(form.get("brandId")) : undefined;
    const processingStrategy = String(form.get("processingStrategy") ?? "sequential");

    const parsedForm = createSchema.safeParse({ name, brandId, processingStrategy });
    if (!parsedForm.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const bytes = Buffer.from(await (file as any).arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) {
      return fail("VALIDATION_ERROR", "CSV file too large (max 5MB)", 413);
    }

    const csvText = bytes.toString("utf8");
    const validation = parseContentCalendarFromCsv(csvText);

    if (!validation.items.length) {
      return fail("VALIDATION_ERROR", "No valid rows found in CSV", 400);
    }

    const items = validation.items as any as BatchItemInput[];
    const estimatedCostUsd = validation.summary?.estimatedCostUsd ?? estimateBatchCostUsd(items);

    const batchJob = await prisma.batchJob.create({
      data: {
        userId: session.user.id,
        brandId: parsedForm.data.brandId ?? null,
        name: parsedForm.data.name,
        status: "pending",
        processingStrategy: parsedForm.data.processingStrategy,
        totalItems: items.length,
        completedItems: 0,
        failedItems: 0,
        inputData: items as any,
        estimatedCostUsd,
        actualCostUsd: null,
        startedAt: null,
        completedAt: null,
        batchMetrics: {},
      },
    });

    await prisma.batchItem.createMany({
      data: items.map((it, idx) => ({
        batchJobId: batchJob.id,
        designId: null,
        itemIndex: idx,
        topic: it.topic,
        date: it.date,
        platform: it.platform,
        format: it.format,
        notes: it.notes ?? null,
        referenceImageUrl: it.referenceImageUrl ?? null,
        status: "pending",
        errorMessage: null,
        revisionPrompt: null,
        anthropicBatchRequestId: null,
      })) as any,
    });

    void processBatchJob(batchJob.id).catch(() => {});

    return ok(
      {
        batchJob,
        validationSummary: {
          errors: validation.errors,
          warnings: validation.warnings,
          summary: validation.summary,
        },
      },
      201
    );
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

