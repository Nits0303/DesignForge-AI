import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await context.params;
    const parsedParams = paramsSchema.safeParse({ id });
    if (!parsedParams.success) return fail("VALIDATION_ERROR", "Invalid batch id", 400);

    const batchJob = await prisma.batchJob.findFirst({
      where: { id: parsedParams.data.id, userId: session.user.id },
      select: {
        id: true,
        name: true,
        status: true,
        processingStrategy: true,
        startedAt: true,
        completedAt: true,
        totalItems: true,
        completedItems: true,
        failedItems: true,
        actualCostUsd: true,
        estimatedCostUsd: true,
        batchMetrics: true,
        updatedAt: true,
      },
    });
    if (!batchJob) return fail("NOT_FOUND", "Batch not found", 404);

    const items = await prisma.batchItem.findMany({
      where: { batchJobId: batchJob.id },
      select: { id: true, status: true },
    });
    const itemCounts: Record<string, number> = {};
    for (const it of items) {
      const k = it.status;
      itemCounts[k] = (itemCounts[k] ?? 0) + 1;
    }

    const startedAt = batchJob.startedAt?.getTime() ?? null;
    const finishedAt = batchJob.completedAt?.getTime() ?? Date.now();
    const processingMs = startedAt ? Math.max(0, finishedAt - startedAt) : null;
    const throughputPerHour =
      processingMs && processingMs > 0 ? (batchJob.completedItems / processingMs) * 3_600_000 : 0;

    // batchMetrics may have placeholders (some strategies don't track per-item durations).
    const m: any = batchJob.batchMetrics ?? {};

    const genLogs = await prisma.generationLog.findMany({
      where: { batchJobId: batchJob.id, costUsd: { not: null } },
      select: { model: true, platform: true, totalTokens: true, costUsd: true },
    });
    const totalTokens = genLogs.reduce((a, l) => a + (l.totalTokens ?? 0), 0);
    const totalCostUsdFromLogs = genLogs.reduce((a, l) => a + (l.costUsd ?? 0), 0);
    const byModel: Record<string, { tokens: number; costUsd: number; designs: number }> = {};
    for (const l of genLogs) {
      const k = String(l.model ?? "unknown");
      if (!byModel[k]) byModel[k] = { tokens: 0, costUsd: 0, designs: 0 };
      byModel[k]!.tokens += l.totalTokens ?? 0;
      byModel[k]!.costUsd += l.costUsd ?? 0;
      byModel[k]!.designs += 1;
    }

    return ok({
      statusCounts: itemCounts,
      processingMs,
      throughputPerHour,
      avgGenerationTimeMs: m.avgGenerationTimeMs ?? null,
      slowestItemMs: m.slowestItemMs ?? null,
      fastestItemMs: m.fastestItemMs ?? null,
      retryCount: m.retryCount ?? null,
      concurrencyUtilisation: m.concurrencyUtilisation ?? null,
      anthropicBatchId: m.anthropicBatchId ?? null,
      anthropicBatchError: m.anthropicBatchError ?? null,
      totalTokens,
      totalCostUsdFromLogs,
      tokensByModel: Object.entries(byModel)
        .map(([model, v]) => ({ model, tokens: v.tokens, costUsd: v.costUsd, designs: v.designs }))
        .sort((a, b) => b.tokens - a.tokens),
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

