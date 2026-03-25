import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { generateDesign } from "@/lib/ai/generationOrchestrator";
import { processAnthropicBatchJob } from "@/lib/batch/anthropicBatchProcessor";
import { DEFAULT_SOCIAL_DIMENSION, SOCIAL_DIMENSIONS } from "@/constants/platforms";

import type { BatchProcessingStrategy, BatchItemStatus } from "@prisma/client";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildBatchPrompt(platform: string, format: string, topic: string, notes?: string) {
  const n = notes ? ` ${notes}` : "";
  // Add a shortcode so smartRouter can infer platform/format reliably.
  return `/${platform} ${format} ${topic}.${n}`.trim();
}

function isSocialPlatform(platform: string) {
  const p = String(platform ?? "").toLowerCase();
  return p === "instagram" || p === "linkedin" || p === "facebook" || p === "twitter";
}

async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
  const res = await redis.setnx(lockKey, "1");
  if (!res) return false;
  await redis.expire(lockKey, ttlSeconds);
  return true;
}

async function releaseLock(lockKey: string) {
  try {
    await redis.del(lockKey);
  } catch {
    // ignore
  }
}

async function resolveBrandId(batch: { brandId: string | null; userId: string }): Promise<string | null> {
  // If the selected brand was deleted, Prisma can still keep the string id on the job.
  // We must verify existence, then fall back to user's default brand, then most recent brand.
  if (batch.brandId) {
    const existing = await prisma.brandProfile.findUnique({
      where: { id: batch.brandId },
      select: { id: true },
    });
    if (existing?.id) return existing.id;
  }

  const defaultBrand = await prisma.brandProfile.findFirst({
    where: { userId: batch.userId, isDefault: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (defaultBrand?.id) return defaultBrand.id;

  const first = await prisma.brandProfile.findFirst({
    where: { userId: batch.userId },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return first?.id ?? null;
}

export async function processBatchJob(batchJobId: string): Promise<void> {
  const lockKey = `batch:lock:${batchJobId}`;
  const ok = await acquireLock(lockKey, 60 * 60);
  if (!ok) return;

  try {
    const batch = await prisma.batchJob.findUnique({
      where: { id: batchJobId },
      include: { items: true },
    });
    if (!batch) return;
    if (batch.status === "cancelled") return;

    const cancelKey = `batch:cancel:${batchJobId}`;

    const brandId = await resolveBrandId(batch);
    if (!brandId) {
      // Best-effort: mark all pending items as failed due to missing brand context.
      await prisma.batchItem.updateMany({
        where: { batchJobId, status: { in: ["pending", "generating"] as any } },
        data: { status: "failed", errorMessage: "Missing brand profile for batch generation." },
      });
      await prisma.batchJob.update({
        where: { id: batchJobId },
        data: { status: "failed", completedAt: new Date() },
      });
      return;
    }

    const startedAt = batch.startedAt ?? new Date();
    await prisma.batchJob.update({
      where: { id: batchJobId },
      data: {
        status: batch.status === "pending" ? "processing" : batch.status,
        startedAt,
      },
    });

    // Determine resume point.
    const items = await prisma.batchItem.findMany({
      where: { batchJobId },
      orderBy: { itemIndex: "asc" },
    });
    const pendingOrGenerating = items.filter((it) => it.status === "pending" || it.status === "generating");

    const effectiveProcessingStrategy: BatchProcessingStrategy =
      batch.processingStrategy === "anthropic_batch" ? "parallel" : batch.processingStrategy;

    if (batch.processingStrategy === "anthropic_batch") {
      // For batch tier we submit a single Claude Message Batch that maps one output => one design.
      // Multi-section generation is disabled for now by constraining sectionPlanOverride.
      if (!brandId) return;
      try {
        await processAnthropicBatchJob({ batchJobId, batch, brandId, items });
        return;
      } catch (err: any) {
        // Best-effort fallback: if batch submission/polling fails, continue via parallel generation.
        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: {
            processingStrategy: "parallel",
            batchMetrics: {
              ...(batch.batchMetrics as any),
              anthropicBatchError: err?.message ? String(err.message) : "Anthropic batch failed",
            } as any,
          },
        });
      }
    }

    let completedItems = await prisma.batchItem.count({ where: { batchJobId, status: { in: ["complete", "approved"] as any } } });
    let failedItems = await prisma.batchItem.count({ where: { batchJobId, status: "failed" } });

    let consecutiveFailures = 0;
    let slowestItemMs = 0;
    let fastestItemMs = Number.POSITIVE_INFINITY;
    let totalItemTimeMs = 0;
    let retryCount = 0;
    let concurrencyUtilisationNumerator = 0;
    let concurrencyUtilisationDenominator = 0;

    const updateCounters = async () => {
      await prisma.batchJob.update({
        where: { id: batchJobId },
        data: {
          completedItems,
          failedItems,
        },
      });
    };

    const processOne = async (itemId: string) => {
      const item = items.find((x) => x.id === itemId);
      if (!item) return;

      const cancelled = await redis.get(cancelKey);
      if (cancelled) return;

      const start = Date.now();
      await prisma.batchItem.update({
        where: { id: itemId },
        data: { status: "generating", errorMessage: null },
      });

      try {
        const selectedDimension =
          isSocialPlatform(item.platform) && item.format === "post"
            ? SOCIAL_DIMENSIONS.find((d) => d.id === (item as any).dimensionId) ?? DEFAULT_SOCIAL_DIMENSION
            : null;
        const gen = await generateDesign({
          userId: batch.userId,
          brandId,
          projectId: undefined,
          prompt: buildBatchPrompt(item.platform, item.format, item.topic, item.notes ?? undefined),
          referenceImageUrl: item.referenceImageUrl ?? undefined,
          strategy: "quality",
          batchJobId,
          selectedDimension,
        });

        completedItems += 1;
        const duration = Date.now() - start;
        slowestItemMs = Math.max(slowestItemMs, duration);
        fastestItemMs = Math.min(fastestItemMs, duration);
        totalItemTimeMs += duration;

        await prisma.batchItem.update({
          where: { id: itemId },
          data: {
            status: "complete",
            designId: gen.designId,
            errorMessage: null,
            revisionPrompt: null,
          },
        });

        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: {
            status: "processing",
            completedItems,
            failedItems,
          },
        });

        await updateCounters();

        return { ok: true, duration };
      } catch (err: any) {
        consecutiveFailures += 1;
        retryCount += 0;
        failedItems += 1;
        const duration = Date.now() - start;
        slowestItemMs = Math.max(slowestItemMs, duration);
        fastestItemMs = Math.min(fastestItemMs, duration);
        totalItemTimeMs += duration;

        await prisma.batchItem.update({
          where: { id: itemId },
          data: {
            status: "failed",
            errorMessage: err?.message ? String(err.message) : "Generation failed",
          },
        });
        await updateCounters();

        return { ok: false, duration };
      }
    };

    const finalize = async () => {
      const total = items.length;
      const updatedFailedItems = await prisma.batchItem.count({ where: { batchJobId, status: "failed" } });
      const updatedCompletedItems = await prisma.batchItem.count({
        where: { batchJobId, status: { in: ["complete", "approved"] as any } },
      });

      const shouldCancel = !!(await redis.get(cancelKey));
      if (shouldCancel) {
        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: { status: "cancelled", completedAt: new Date() },
        });
        return;
      }

      const genLogs = await prisma.generationLog.findMany({
        where: { batchJobId, costUsd: { not: null } },
        select: { costUsd: true },
      });
      const actualCostUsd = genLogs.reduce((a, l) => a + (l.costUsd ?? 0), 0);

      const completedCount = updatedCompletedItems;
      const failedCount = updatedFailedItems;
      const avgGenerationTimeMs = total ? totalItemTimeMs / total : 0;

      const batchMetrics = {
        avgGenerationTimeMs,
        slowestItemMs: slowestItemMs || 0,
        fastestItemMs: fastestItemMs === Number.POSITIVE_INFINITY ? 0 : fastestItemMs,
        retryCount,
        concurrencyUtilisation:
          effectiveProcessingStrategy === "parallel" && concurrencyUtilisationDenominator > 0
            ? concurrencyUtilisationNumerator / concurrencyUtilisationDenominator
            : null,
      };

      if (updatedCompletedItems >= total && updatedFailedItems === 0) {
        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: {
            status: "completed",
            completedAt: new Date(),
            actualCostUsd,
            batchMetrics,
          },
        });
      } else if (updatedCompletedItems > 0 && updatedFailedItems > 0) {
        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: { status: "partial", completedAt: new Date(), actualCostUsd, batchMetrics },
        });
      } else {
        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: { status: "failed", completedAt: new Date(), actualCostUsd, batchMetrics },
        });
      }

      // Notify user (lightweight).
      const batchStatus = completedCount >= total && failedCount === 0 ? "completed" : updatedCompletedItems > 0 ? "partial" : "failed";
      if (batchStatus === "completed" || batchStatus === "partial") {
        const pref = await prisma.userPreference.findUnique({
          where: { userId_preferenceKey: { userId: batch.userId, preferenceKey: "notify_batch_complete" } },
          select: { preferenceValue: true },
        });
        const notifyBatchComplete = pref?.preferenceValue === false ? false : true;
        if (notifyBatchComplete) {
          const title = "Your batch is ready";
          const body = `'${batch.name}' — ${completedCount} designs generated successfully`;
          await prisma.notification.create({
            data: {
              userId: batch.userId,
              type: "batch_complete",
              title,
              body,
              isRead: false,
              actionUrl: `/batch/${batchJobId}`,
            },
          });
        }
      }
    };

    if (effectiveProcessingStrategy === "parallel") {
      const chunks: typeof pendingOrGenerating[] = [];
      for (let i = 0; i < pendingOrGenerating.length; i += 5) {
        chunks.push(pendingOrGenerating.slice(i, i + 5));
      }

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci]!;
        concurrencyUtilisationNumerator += chunk.length;
        concurrencyUtilisationDenominator += 5;
        const results = await Promise.allSettled(chunk.map((it) => processOne(it.id)));
        // Circuit breaker: if too many failures in the last chunk.
        const failedCount = results.filter((r) => r.status === "fulfilled" && !(r.value as any)?.ok).length;
        if (failedCount >= 3) await sleep(30_000);
      }
    } else {
      // sequential fallback
      for (const item of pendingOrGenerating) {
        const cancelled = await redis.get(cancelKey);
        if (cancelled) break;
        const res = await processOne(item.id);
        if (res && !(res as any)?.ok) {
          if (consecutiveFailures >= 3) {
            await sleep(30_000);
            consecutiveFailures = 0;
          }
        } else {
          consecutiveFailures = 0;
        }
      }
    }

    await finalize();
  } finally {
    await releaseLock(lockKey);
  }
}

export async function resumeProcessingBatches(): Promise<void> {
  // Best-effort resume helper: scan processing jobs and resume them.
  const batches = await prisma.batchJob.findMany({
    where: { status: "processing" },
    select: { id: true, startedAt: true },
  });

  // Avoid unbounded concurrency; resume sequentially.
  for (const b of batches) {
    // If the job has been “processing” for a long time, assume the worker lock is stale
    // (e.g. worker died) and clear it so we can resume.
    const startedAtMs = b.startedAt ? b.startedAt.getTime() : 0;
    const ageMs = startedAtMs ? Date.now() - startedAtMs : 0;
    if (ageMs > 30 * 60 * 1000) {
      const lockKey = `batch:lock:${b.id}`;
      await redis.del(lockKey).catch(() => {});
    }
    void processBatchJob(b.id);
  }
}

