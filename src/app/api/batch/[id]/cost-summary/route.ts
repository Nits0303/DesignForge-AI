import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().min(1) });

function groupBy<T>(arr: T[], keyFn: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = keyFn(x);
    const existing = m.get(k);
    if (existing) existing.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await context.params;
    const parsed = paramsSchema.safeParse({ id });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid batch id", 400);

    const batchJob = await prisma.batchJob.findFirst({
      where: { id: parsed.data.id, userId: session.user.id },
      select: { id: true, name: true, processingStrategy: true, estimatedCostUsd: true, actualCostUsd: true, totalItems: true },
    });
    if (!batchJob) return fail("NOT_FOUND", "Batch not found", 404);

    // Actual cost comes from generation logs linked to this batch.
    const genLogs = await prisma.generationLog.findMany({
      where: { batchJobId: batchJob.id, costUsd: { not: null } },
      select: { platform: true, model: true, costUsd: true, totalTokens: true },
    });

    const totalCostUsd = genLogs.reduce((a, l) => a + (l.costUsd ?? 0), 0);

    const estimatedCostUsd = batchJob.estimatedCostUsd ?? null;
    const savingsFromBatchApi =
      batchJob.processingStrategy === "anthropic_batch" && estimatedCostUsd != null ? estimatedCostUsd - totalCostUsd : 0;

    const platformGroups = groupBy(genLogs, (l) => String(l.platform ?? "unknown"));
    const breakdown = Array.from(platformGroups.entries()).map(([platform, logs]) => {
      const costUsd = logs.reduce((a, l) => a + (l.costUsd ?? 0), 0);
      const totalTokens = logs.reduce((a, l) => a + (l.totalTokens ?? 0), 0);
      const itemCount = logs.length;
      return {
        platform,
        itemCount,
        costUsd,
        totalTokens,
        avgCostPerDesign: itemCount ? costUsd / itemCount : 0,
      };
    });

    const modelGroups = groupBy(genLogs, (l) => String(l.model ?? "unknown"));
    const modelBreakdown = Array.from(modelGroups.entries()).map(([model, logs]) => {
      const costUsd = logs.reduce((a, l) => a + (l.costUsd ?? 0), 0);
      const totalTokens = logs.reduce((a, l) => a + (l.totalTokens ?? 0), 0);
      return { model, tokens: totalTokens, costUsd, avgCostPerThousandTokens: totalTokens ? (costUsd / totalTokens) * 1000 : 0 };
    });

    return ok({
      totalCostUsd,
      estimatedCostUsd: estimatedCostUsd ?? totalCostUsd,
      savingsFromBatchApi,
      breakdown,
      modelBreakdown,
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

