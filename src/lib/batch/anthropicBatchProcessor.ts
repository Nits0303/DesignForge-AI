import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { anthropic } from "@/lib/ai/anthropicClient";
import { isGeminiPrimaryLlm } from "@/lib/ai/geminiClient";
import { PROMPTS } from "@/lib/ai/prompts";
import type { BatchItem, BatchJob } from "@prisma/client";
import {
  planDesignForAnthropicBatch,
  persistSingleDesignFromPlannedBatchResult,
} from "@/lib/ai/generationOrchestrator";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildBatchPrompt(platform: string, format: string, topic: string, notes?: string) {
  const n = notes ? ` ${notes}` : "";
  // Smart router relies on shortcodes like `/<platform> <format> <topic>`
  return `/${platform} ${format} ${topic}.${n}`.trim();
}

function extractFirstTextBlock(message: any): string | null {
  const content = message?.content;
  if (!Array.isArray(content)) return null;
  const textBlock = content.find((b) => b?.type === "text" && typeof b?.text === "string");
  return textBlock?.text ?? null;
}

function getBatchErrorMessage(result: any): string {
  if (!result || typeof result !== "object") return "Batch request failed";
  if (result.type === "errored" && result.error?.message) return String(result.error.message);
  if (result.type === "canceled") return "Batch request cancelled";
  if (result.type === "expired") return "Batch request expired";
  if (result.type === "succeeded") return "Unexpected succeeded result";
  return `Batch request failed: ${String(result.type ?? "unknown")}`;
}

async function pollBatchUntilEnded(messageBatchId: string, cancelKey: string): Promise<boolean> {
  // Returns true if ended normally, false if cancelled.
  while (true) {
    const cancelFlag = await redis.get(cancelKey);
    if (cancelFlag) {
      try {
        await anthropic.messages.batches.cancel(messageBatchId);
      } catch {
        // ignore cancel failures
      }
      return false;
    }

    const batch = await anthropic.messages.batches.retrieve(messageBatchId);
    const status = batch.processing_status;
    if (status === "ended") return true;
    if (status === "canceling") return false;
    await sleep(10_000);
  }
}

export async function processAnthropicBatchJob(args: {
  batchJobId: string;
  batch: BatchJob;
  brandId: string;
  items: BatchItem[];
}): Promise<void> {
  const { batchJobId, batch, brandId, items } = args;
  const cancelKey = `batch:cancel:${batchJobId}`;

  if (isGeminiPrimaryLlm()) {
    await prisma.batchItem.updateMany({
      where: { batchJobId, status: { in: ["pending", "generating"] as any } },
      data: {
        status: "failed",
        errorMessage:
          "Batch jobs require the Anthropic API. With Gemini-only MVP mode, use single-design generation until ANTHROPIC_API_KEY is configured.",
        revisionPrompt: null,
      },
    });
    const failedCount = await prisma.batchItem.count({ where: { batchJobId, status: "failed" } });
    const completedCount = await prisma.batchItem.count({
      where: { batchJobId, status: { in: ["complete", "approved"] as any } },
    });
    await prisma.batchJob.update({
      where: { id: batchJobId },
      data: {
        status: failedCount > 0 && completedCount === 0 ? "failed" : "partial",
        completedItems: completedCount,
        failedItems: failedCount,
        completedAt: new Date(),
        batchMetrics: {
          ...(batch.batchMetrics && typeof batch.batchMetrics === "object" ? (batch.batchMetrics as any) : {}),
          geminiBatchUnsupported: true,
        } as any,
      },
    });
    return;
  }

  // Mark the batch as processing right away (if it wasn't already).
  await prisma.batchJob.update({
    where: { id: batchJobId },
    data: { status: batch.status === "pending" ? "processing" : batch.status, startedAt: batch.startedAt ?? new Date() },
  });

  // If this worker is resuming after a restart, we may already have one or more active batch IDs.
  const generatingItems = items.filter((it) => it.status === "generating" && !!it.anthropicBatchRequestId);
  const uniqueMessageBatchIds = Array.from(new Set(generatingItems.map((it) => it.anthropicBatchRequestId!)));

  const metricsAnthropicBatchId =
    (batch.batchMetrics as any)?.anthropicBatchId && typeof (batch.batchMetrics as any)?.anthropicBatchId === "string"
      ? String((batch.batchMetrics as any)?.anthropicBatchId)
      : null;
  if (metricsAnthropicBatchId && !uniqueMessageBatchIds.includes(metricsAnthropicBatchId)) {
    uniqueMessageBatchIds.push(metricsAnthropicBatchId);
  }

  const processMessageBatch = async (messageBatchId: string) => {
    let completedCount = await prisma.batchItem.count({
      where: { batchJobId, status: { in: ["complete", "approved"] as any } },
    });
    let failedCount = await prisma.batchItem.count({ where: { batchJobId, status: "failed" } });

    let totalItemTimeMsLocal = 0;
    let slowestItemMsLocal = 0;
    let fastestItemMsLocal = Number.POSITIVE_INFINITY;
    let timedItemsLocal = 0;

    // Pull results. If the SDK rejects due to premature access, treat it as not-yet-ready.
    const endedNormally = await pollBatchUntilEnded(messageBatchId, cancelKey);
    if (!endedNormally) return;

    const decoder = await anthropic.messages.batches.results(messageBatchId);

    for await (const line of decoder as any) {
      const customId = line?.custom_id;
      const result = line?.result;
      if (!customId) continue;

      const item = items.find((x) => x.id === customId);
      if (!item) continue;

      // If the job was cancelled while we were processing the results, stop early.
      const cancelFlag = await redis.get(cancelKey);
      if (cancelFlag) return;

      if (result?.type === "succeeded") {
        const message = result.message;
        const html = extractFirstTextBlock(message);

        if (!html) {
          await prisma.batchItem.update({
            where: { id: item.id },
            data: { status: "failed", errorMessage: "Empty/invalid batch response HTML", revisionPrompt: null },
          });
          failedCount += 1;
          continue;
        }

        try {
          const planned = await planDesignForAnthropicBatch({
            userId: batch.userId,
            brandId,
            projectId: undefined,
            prompt: buildBatchPrompt(item.platform, item.format, item.topic, item.notes ?? undefined),
            referenceImageUrl: item.referenceImageUrl ?? undefined,
            strategy: "quality",
            batchJobId,
          });

          const persisted = await persistSingleDesignFromPlannedBatchResult({
            userId: batch.userId,
            brandId,
            projectId: undefined,
            prompt: buildBatchPrompt(item.platform, item.format, item.topic, item.notes ?? undefined),
            batchJobId,
            plan: planned.plan,
            remainingPrompt: planned.remainingPrompt,
            html,
            usage: message?.usage ?? {},
            costUsdMultiplier: 0.5, // PRD: batch tier => ~50% cost
          });

          await prisma.batchItem.update({
            where: { id: item.id },
            data: {
              status: "complete",
              designId: persisted.designId,
              errorMessage: null,
              revisionPrompt: null,
            },
          });

          totalItemTimeMsLocal += persisted.generationTimeMs;
          slowestItemMsLocal = Math.max(slowestItemMsLocal, persisted.generationTimeMs);
          fastestItemMsLocal = Math.min(fastestItemMsLocal, persisted.generationTimeMs);
          timedItemsLocal += 1;

          completedCount += 1;
          await prisma.batchJob.update({
            where: { id: batchJobId },
            data: { completedItems: completedCount, failedItems: failedCount },
          });
        } catch (err: any) {
          await prisma.batchItem.update({
            where: { id: item.id },
            data: {
              status: "failed",
              errorMessage: err?.message ? String(err.message) : "Batch persistence failed",
              revisionPrompt: null,
            },
          });
          failedCount += 1;
          await prisma.batchJob.update({
            where: { id: batchJobId },
            data: { completedItems: completedCount, failedItems: failedCount },
          });
        }
      } else {
        await prisma.batchItem.update({
          where: { id: item.id },
          data: { status: "failed", errorMessage: getBatchErrorMessage(result), revisionPrompt: null },
        });
        failedCount += 1;
        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: { completedItems: completedCount, failedItems: failedCount },
        });
      }
    }

    // Persist per-batch timing metrics opportunistically.
    if (timedItemsLocal > 0) {
      const avgGenerationTimeMs = totalItemTimeMsLocal / timedItemsLocal;
      await prisma.batchJob.update({
        where: { id: batchJobId },
        data: {
          batchMetrics: {
            ...(batch.batchMetrics as any),
            avgGenerationTimeMs,
            slowestItemMs: slowestItemMsLocal,
            fastestItemMs: fastestItemMsLocal === Number.POSITIVE_INFINITY ? 0 : fastestItemMsLocal,
            retryCount: 0,
            concurrencyUtilisation: null,
          } as any,
        },
      });
    }
  };

  // Resume: handle any batches already in-flight.
  for (const messageBatchId of uniqueMessageBatchIds) {
    await processMessageBatch(messageBatchId);
  }

  // Now submit a new batch for items still pending.
  const remainingPending = await prisma.batchItem.findMany({
    where: { batchJobId, status: "pending" },
    orderBy: { itemIndex: "asc" },
    select: {
      id: true,
      itemIndex: true,
      topic: true,
      date: true,
      platform: true,
      format: true,
      notes: true,
      referenceImageUrl: true,
    },
  });

  const cancelledEarly = await redis.get(cancelKey);
  if (cancelledEarly) {
    await prisma.batchItem.updateMany({
      where: { batchJobId, status: { in: ["pending", "generating"] as any } },
      data: { status: "failed", errorMessage: "Batch cancelled", revisionPrompt: null },
    });
    await prisma.batchJob.update({
      where: { id: batchJobId },
      data: { status: "cancelled", completedAt: new Date() },
    });
    return;
  }

  if (!remainingPending.length) {
    // Finalize even if we only resumed existing batches.
    const failedCount = await prisma.batchItem.count({ where: { batchJobId, status: "failed" } });
    const completedCount = await prisma.batchItem.count({
      where: { batchJobId, status: { in: ["complete", "approved"] as any } },
    });

    const genLogs = await prisma.generationLog.findMany({
      where: { batchJobId, costUsd: { not: null } },
      select: { costUsd: true },
    });
    const actualCostUsd = genLogs.reduce((a, l) => a + (l.costUsd ?? 0), 0);

    let status: "completed" | "partial" | "failed" | "cancelled" = "completed";
    if (failedCount > 0 && completedCount > 0) status = "partial";
    else if (failedCount > 0) status = "failed";

    const cancelled = await redis.get(cancelKey);
    if (cancelled) status = "cancelled";

    if (status === "cancelled") {
      await prisma.batchItem.updateMany({
        where: { batchJobId, status: { in: ["pending", "generating"] as any } },
        data: { status: "failed", errorMessage: "Batch cancelled", revisionPrompt: null },
      });
    }

    await prisma.batchJob.update({
      where: { id: batchJobId },
      data: {
        status,
        completedItems: completedCount,
        failedItems: failedCount,
        completedAt: new Date(),
        actualCostUsd,
        batchMetrics: {
          avgGenerationTimeMs: null,
          retryCount: 0,
          concurrencyUtilisation: null,
        },
      } as any,
    });

    if (status === "completed" || status === "partial") {
      await prisma.notification.create({
        data: {
          userId: batch.userId,
          type: "batch_complete",
          title: "Your batch is ready",
          body: `'${batch.name}' — ${completedCount} designs generated successfully`,
          isRead: false,
          actionUrl: `/batch/${batchJobId}`,
        },
      });
    }
    return;
  }

  // Plan all pending items up-front (so request bodies are consistent).
  const requests: any[] = [];

  for (const it of remainingPending) {
    const prompt = buildBatchPrompt(it.platform, it.format, it.topic, it.notes ?? undefined);
    const planned = await planDesignForAnthropicBatch({
      userId: batch.userId,
      brandId,
      projectId: undefined,
      prompt,
      referenceImageUrl: it.referenceImageUrl ?? undefined,
      strategy: "quality",
      batchJobId,
    });

    requests.push({
      custom_id: it.id,
      params: {
        model: planned.plan.model,
        system: planned.plan.system,
        max_tokens: planned.plan.maxTokens,
        messages: planned.plan.messages,
        metadata: {
          cache_control: { type: "ephemeral" },
          system_version: PROMPTS.generation.version,
        } as any,
      },
    });
  }

  // Mark as generating, so the UI can reflect “work in progress”.
  await prisma.batchItem.updateMany({
    where: { batchJobId, id: { in: remainingPending.map((x) => x.id) } },
    data: { status: "generating", errorMessage: null, revisionPrompt: null },
  });

  // Submit the Claude message batch.
  const messageBatch = await anthropic.messages.batches.create({ requests });
  const messageBatchId: string = (messageBatch as any).id;

  const safeMetrics = batch.batchMetrics && typeof batch.batchMetrics === "object" ? (batch.batchMetrics as any) : {};
  await prisma.batchJob.update({
    where: { id: batchJobId },
    data: {
      batchMetrics: {
        ...safeMetrics,
        anthropicBatchId: messageBatchId,
      } as any,
    },
  });

  await prisma.batchItem.updateMany({
    where: { batchJobId, id: { in: remainingPending.map((x) => x.id) } },
    data: { anthropicBatchRequestId: messageBatchId },
  });

  // Process this batch.
  await processMessageBatch(messageBatchId);

  // Finalize.
  const failedCount = await prisma.batchItem.count({ where: { batchJobId, status: "failed" } });
  const completedCount = await prisma.batchItem.count({
    where: { batchJobId, status: { in: ["complete", "approved"] as any } },
  });
  const genLogs = await prisma.generationLog.findMany({
    where: { batchJobId, costUsd: { not: null } },
    select: { costUsd: true },
  });
  const actualCostUsd = genLogs.reduce((a, l) => a + (l.costUsd ?? 0), 0);

  const cancelled = await redis.get(cancelKey);
  let status: BatchJob["status"] = "completed";
  if (cancelled) status = "cancelled";
  else if (failedCount > 0 && completedCount > 0) status = "partial";
  else if (failedCount > 0) status = "failed";

  if (status === "cancelled") {
    await prisma.batchItem.updateMany({
      where: { batchJobId, status: { in: ["pending", "generating"] as any } },
      data: { status: "failed", errorMessage: "Batch cancelled", revisionPrompt: null },
    });
  }

  await prisma.batchJob.update({
    where: { id: batchJobId },
    data: {
      status,
      completedItems: completedCount,
      failedItems: failedCount,
      completedAt: new Date(),
      actualCostUsd,
      batchMetrics: {
        avgGenerationTimeMs: null,
        retryCount: 0,
        concurrencyUtilisation: null,
      },
    } as any,
  });

  if (status === "completed" || status === "partial") {
    const pref = await prisma.userPreference.findUnique({
      where: { userId_preferenceKey: { userId: batch.userId, preferenceKey: "notify_batch_complete" } },
      select: { preferenceValue: true },
    });
    const notifyBatchComplete = pref?.preferenceValue === false ? false : true;

    if (notifyBatchComplete) {
      await prisma.notification.create({
        data: {
          userId: batch.userId,
          type: "batch_complete",
          title: "Your batch is ready",
          body: `'${batch.name}' — ${completedCount} designs generated successfully`,
          isRead: false,
          actionUrl: `/batch/${batchJobId}`,
        },
      });
    }
  }
}

