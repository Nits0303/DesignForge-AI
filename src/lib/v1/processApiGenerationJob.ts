import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { streamGenerateDesign } from "@/lib/ai/generationOrchestrator";
import { deliverWebhookOnce } from "@/lib/api/webhookDelivery";
import type { WebhookEventType } from "@/lib/api/webhookDelivery";
import { V1_GENERATION_QUEUE } from "@/lib/v1/enqueueApiGenerationJob";

/**
 * Runs queued v1 generation: load job → streamGenerateDesign → webhook on success.
 * Safe to call from worker or cron (idempotent if job not queued).
 */
export async function processApiGenerationJob(jobId: string): Promise<void> {
  const job = await prisma.apiGenerationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "queued") return;

  await prisma.apiGenerationJob.update({
    where: { id: jobId },
    data: { status: "processing", errorMessage: null },
  });

  const input = job.input as {
    prompt?: string;
    brandId?: string;
    projectId?: string;
  };
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const userId = job.userId;

  try {
    let brandId = input.brandId;
    if (!brandId) {
      const def = await prisma.brandProfile.findFirst({
        where: { userId, isDefault: true },
        select: { id: true },
      });
      const any = def ?? (await prisma.brandProfile.findFirst({
        where: { userId },
        select: { id: true },
      }));
      brandId = any?.id;
    }
    if (!brandId) {
      throw new Error("No brand profile — create one or pass brandId in job input.");
    }

    const brand = await prisma.brandProfile.findFirst({
      where: { id: brandId, userId },
      select: { id: true },
    });
    if (!brand) throw new Error("brandId not found or access denied");

    const result = await streamGenerateDesign(
      {
        userId,
        brandId,
        projectId: input.projectId,
        prompt,
      },
      {}
    );

    await prisma.apiGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "complete",
        resultDesignId: result.designId,
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    if (job.apiKeyId) {
      const keyRow = await prisma.apiKey.findUnique({ where: { id: job.apiKeyId } });
      if (keyRow?.webhookUrl && keyRow.webhookSecret) {
        await deliverWebhookOnce({
          apiKey: keyRow,
          event: "design.generation.completed" as WebhookEventType,
          body: {
            jobId: job.id,
            designId: result.designId,
            versionNumber: result.versionNumber,
            status: "complete",
          },
          requestId: job.clientRequestId ?? undefined,
        });
      }
    }
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : "Generation failed";
    await prisma.apiGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: msg.slice(0, 2000),
        completedAt: new Date(),
      },
    });

    if (job.apiKeyId) {
      const keyRow = await prisma.apiKey.findUnique({ where: { id: job.apiKeyId } });
      if (keyRow?.webhookUrl && keyRow.webhookSecret) {
        await deliverWebhookOnce({
          apiKey: keyRow,
          event: "design.generation.failed" as WebhookEventType,
          body: { jobId: job.id, error: msg.slice(0, 500), status: "failed" },
          requestId: job.clientRequestId ?? undefined,
        });
      }
    }
  }
}

/** Pop one job id from Redis (non-blocking). */
export async function popOneV1GenerationJobId(): Promise<string | null> {
  const id = await redis.lpop(V1_GENERATION_QUEUE);
  return id || null;
}
