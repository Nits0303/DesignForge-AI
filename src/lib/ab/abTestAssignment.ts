import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export type AbVariantRecord = {
  id: string;
  name?: string;
  description?: string;
  allocationPercent?: number;
  systemPromptVersion?: string;
  templateSelectionStrategy?: string;
  promptModifications?: Record<string, unknown>;
};

export type MergedAbPromptContext = {
  systemPromptVersion?: string;
  /** Maps to componentSelector strategies */
  templateSelectionStrategy?:
    | "default"
    | "prefer_high_approval"
    | "prefer_recency"
    | "prefer_diversity";
  headlineSizeModifier?: number;
  spacingModifier?: number;
  additionalInstruction?: string;
  brandContextLevel?: "full" | "colors_only" | "none";
};

export type TestAssignmentEntry = { testId: string; variantId: string };

/** SHA-256(testId + userId) → first 4 bytes → uint32 → mod 100 (Sprint 16). */
export function computeAssignmentSlot(testId: string, userId: string): number {
  const buf = crypto.createHash("sha256").update(`${testId}${userId}`).digest();
  const n = buf.readUInt32BE(0);
  return n % 100;
}

function ttlSecondsForTest(endDate: Date | null, startDate: Date): number {
  const end = endDate ? endDate.getTime() : startDate.getTime() + 90 * 24 * 60 * 60 * 1000;
  const plus7d = 7 * 24 * 60 * 60 * 1000;
  const ms = Math.max(end + plus7d - Date.now(), 60 * 60 * 1000);
  return Math.ceil(ms / 1000);
}

function pickVariantFromSlot(
  variants: AbVariantRecord[],
  slot: number,
  holdbackPercent: number
): { variantId: string | null; holdback: boolean } {
  const H = Math.max(0, Math.min(100, Math.floor(holdbackPercent)));
  if (slot < H) return { variantId: null, holdback: true };

  const totalNonHoldback = 100 - H;
  const innerSlot = slot - H; // 0 .. totalNonHoldback - 1
  const t = innerSlot / Math.max(1, totalNonHoldback);

  let cum = 0;
  for (const v of variants) {
    const p = Number(v.allocationPercent ?? 0) / 100;
    cum += p;
    if (t < cum) {
      return { variantId: String(v.id), holdback: false };
    }
  }
  const last = variants[variants.length - 1];
  return last ? { variantId: String(last.id), holdback: false } : { variantId: null, holdback: true };
}

async function countPriorGenerations(userId: string): Promise<number> {
  return prisma.generationLog.count({
    where: { userId },
  });
}

async function getCachedAssignment(
  testId: string,
  userId: string,
  ttlSec: number
): Promise<{ variantId: string | null; holdback: boolean } | null> {
  const key = `abtest:assignment:${testId}:${userId}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { variantId: string | null; holdback?: boolean };
    return { variantId: parsed.variantId, holdback: !!parsed.holdback };
  } catch {
    return null;
  }
}

async function setCachedAssignment(
  testId: string,
  userId: string,
  value: { variantId: string | null; holdback: boolean },
  ttlSec: number
): Promise<void> {
  const key = `abtest:assignment:${testId}:${userId}`;
  await redis.set(key, JSON.stringify(value), "EX", ttlSec);
}

export async function resolveAbTestsForGeneration(args: {
  userId: string;
  platform: string;
  format: string;
  now?: Date;
}): Promise<{
  assignments: TestAssignmentEntry[];
  merged: MergedAbPromptContext;
  /** First variant id for legacy `testVariantId` column */
  legacyTestVariantId: string | null;
}> {
  const now = args.now ?? new Date();
  const tests = await prisma.promptABTest.findMany({
    where: {
      status: "running",
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      AND: [
        { OR: [{ platform: args.platform }, { platform: "all" }] },
        { OR: [{ format: args.format }, { format: "all" }] },
      ],
    },
    orderBy: { id: "asc" },
  });

  const priorGens = await countPriorGenerations(args.userId);
  const assignments: TestAssignmentEntry[] = [];
  const merged: MergedAbPromptContext = {};

  for (const test of tests) {
    const variants = (test.variants as AbVariantRecord[]) ?? [];
    if (!variants.length) continue;

    if (test.excludeNewUsers && priorGens < 3) {
      continue;
    }

    const ttl = ttlSecondsForTest(test.endDate, test.startDate);
    const cached = await getCachedAssignment(test.id, args.userId, ttl);
    const slot = computeAssignmentSlot(test.id, args.userId);
    let picked: { variantId: string | null; holdback: boolean };

    if (cached) {
      picked = cached;
    } else {
      picked = pickVariantFromSlot(variants, slot, test.holdbackPercent ?? 0);
      await setCachedAssignment(test.id, args.userId, picked, ttl);
    }

    if (picked.holdback || !picked.variantId) continue;

    const variant = variants.find((v) => String(v.id) === picked.variantId);
    if (!variant) continue;

    assignments.push({ testId: test.id, variantId: picked.variantId });

    const mods = (variant.promptModifications ?? {}) as Record<string, unknown>;
    const strat = variant.templateSelectionStrategy ?? mods.templateSelectionStrategy;
    if (typeof strat === "string") {
      merged.templateSelectionStrategy = strat as MergedAbPromptContext["templateSelectionStrategy"];
    }
    const spv = variant.systemPromptVersion ?? mods.systemPromptVersion;
    if (typeof spv === "string") merged.systemPromptVersion = spv;

    if (typeof mods.headlineSizeModifier === "number") {
      merged.headlineSizeModifier = (merged.headlineSizeModifier ?? 1) * mods.headlineSizeModifier;
    }
    if (typeof mods.spacingModifier === "number") {
      merged.spacingModifier = (merged.spacingModifier ?? 1) * mods.spacingModifier;
    }
    if (typeof mods.additionalInstruction === "string") {
      merged.additionalInstruction = merged.additionalInstruction
        ? `${merged.additionalInstruction}\n${mods.additionalInstruction}`
        : mods.additionalInstruction;
    }
    if (mods.brandContextLevel === "full" || mods.brandContextLevel === "colors_only" || mods.brandContextLevel === "none") {
      merged.brandContextLevel = mods.brandContextLevel;
    }
  }

  const legacyTestVariantId = assignments[0]?.variantId ?? null;

  return { assignments, merged, legacyTestVariantId };
}
