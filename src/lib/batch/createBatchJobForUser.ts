import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { processBatchJob } from "@/lib/batch/batchProcessor";
import { estimateBatchCostUsd, type BatchItemInput } from "@/lib/batch/contentCalendarParser";
import { parseShortcode } from "@/lib/ai/shortcodeParser";

const itemSchema = z.object({
  topic: z.string().min(1),
  date: z.string().min(1),
  platform: z.string().min(1),
  format: z.string().min(1),
  notes: z.string().max(500).optional(),
  referenceImageUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

export const batchCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  brandId: z.string().optional(),
  items: z.array(itemSchema).min(1).max(100),
  processingStrategy: z.enum(["anthropic_batch", "sequential", "parallel"]),
});

export type BatchCreateInput = z.infer<typeof batchCreateInputSchema>;

function tokenizeTopic(topic: string): string[] {
  return String(topic ?? "")
    .toLowerCase()
    .split(" ")
    .map((w) => w.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
}

function topicSimilarity(a: string, b: string): number {
  const ta = new Set(tokenizeTopic(a));
  const tb = new Set(tokenizeTopic(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function extractTopicFromOriginalPrompt(originalPrompt: string | null): string | null {
  if (!originalPrompt) return null;
  const parsed = parseShortcode(originalPrompt);
  if (!parsed) return null;
  const remaining = String(parsed.remainingPrompt ?? "").trim();
  if (!remaining) return null;
  return remaining.split(".")[0]?.trim() ? remaining.split(".")[0]?.trim() : null;
}

function safeMonthKey(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return String(dateStr).slice(0, 7);
}

/**
 * Creates a batch job + items and kicks off background processing (same behavior as POST /api/batch/create).
 */
export async function createBatchJobForUser(args: {
  userId: string;
  input: BatchCreateInput;
}): Promise<{
  job: Awaited<ReturnType<typeof prisma.batchJob.create>>;
  duplicateSkipped: { itemIndex: number; topic: string; platform: string; date: string }[];
}> {
  const { name, brandId, items, processingStrategy } = args.input;
  const totalItems = items.length;
  const estimatedCostUsd = estimateBatchCostUsd(items as unknown as BatchItemInput[]);

  const monthKeysByIndex = items.map((it) => safeMonthKey(it.date ?? null));
  const similarityThreshold = 0.65;
  const lookbackDays = 180;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const platformFormatGroups = Array.from(
    new Set(items.map((it) => `${String(it.platform).toLowerCase()}::${String(it.format).toLowerCase()}`))
  );

  const candidateDesigns = await prisma.design.findMany({
    where: {
      userId: args.userId,
      createdAt: { gte: since },
    },
    select: { id: true, platform: true, format: true, originalPrompt: true, createdAt: true },
    take: 250,
    orderBy: { createdAt: "desc" },
  });

  const candidatesByPlatformFormat: Record<string, typeof candidateDesigns> = {};
  for (const d of candidateDesigns) {
    const key = `${String(d.platform).toLowerCase()}::${String(d.format).toLowerCase()}`;
    if (!candidatesByPlatformFormat[key]) candidatesByPlatformFormat[key] = [];
    candidatesByPlatformFormat[key]!.push(d);
  }

  const isPotentialDuplicate = (idx: number) => {
    const it = items[idx]!;
    const monthKey = monthKeysByIndex[idx];
    const key = `${String(it.platform).toLowerCase()}::${String(it.format).toLowerCase()}`;
    const candidates = candidatesByPlatformFormat[key] ?? [];
    const topicA = String(it.topic ?? "");
    for (const cand of candidates) {
      const candTopic = extractTopicFromOriginalPrompt(cand.originalPrompt);
      if (!candTopic) continue;
      const sim = topicSimilarity(topicA, candTopic);
      if (sim >= similarityThreshold) {
        if (!monthKey) return true;
        const candMonthKey = cand.createdAt.toISOString().slice(0, 7);
        if (candMonthKey === monthKey) return true;
      }
    }
    return false;
  };

  const duplicateSkipped: { itemIndex: number; topic: string; platform: string; date: string }[] = [];

  const job = await prisma.batchJob.create({
    data: {
      userId: args.userId,
      brandId: brandId ?? null,
      name,
      status: "pending",
      processingStrategy,
      totalItems,
      completedItems: 0,
      failedItems: 0,
      inputData: items as object,
      estimatedCostUsd,
      actualCostUsd: null,
      startedAt: null,
      completedAt: null,
      batchMetrics: {},
    },
  });

  await prisma.batchItem.createMany({
    data: items.map((it, idx) => ({
      batchJobId: job.id,
      designId: null,
      itemIndex: idx,
      topic: it.topic,
      date: it.date,
      platform: it.platform,
      format: it.format,
      notes: it.notes,
      referenceImageUrl: it.referenceImageUrl || null,
      status: isPotentialDuplicate(idx) ? "failed" : "pending",
      errorMessage: isPotentialDuplicate(idx) ? "Duplicate detected (skipped generation)." : null,
      revisionPrompt: null,
      anthropicBatchRequestId: null,
      ...(isPotentialDuplicate(idx)
        ? (() => {
            duplicateSkipped.push({ itemIndex: idx, topic: it.topic, platform: it.platform, date: it.date });
            return {};
          })()
        : {}),
    })) as any,
  });

  void processBatchJob(job.id).catch(() => {});

  return { job, duplicateSkipped };
}
