import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { evaluatePromptABTest, incrementAbTestCheckCount } from "@/lib/learning/abTestEvaluator";
import { promoteAbTestWinner } from "@/lib/learning/abTestPromoter";
import { getMissingVariantPromptVersionKey } from "@/lib/ai/prompts/promptVersionRegistry";
import { emitDesignForgeWebhook } from "@/lib/webhooks/deliver";

async function countAssignmentsLastDays(testId: string, days: number, now: Date): Promise<number> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const logs = await prisma.generationLog.findMany({
    where: {
      createdAt: { gte: since },
      testAssignments: { not: Prisma.DbNull },
    },
    select: { testAssignments: true },
  });
  let n = 0;
  for (const l of logs) {
    const arr = l.testAssignments as Array<{ testId?: string }> | null;
    if (Array.isArray(arr) && arr.some((x) => x && String(x.testId) === testId)) n += 1;
  }
  return n;
}

export async function abTestEvaluationJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  testsEvaluated: string[];
  testsCompleted: string[];
  testsCancelled: string[];
  results: Array<{
    testId: string;
    minSampleReached: boolean;
    pValue: number | null;
    chi2: number | null;
    winnerVariantId: string | null;
    variantStats: unknown[];
  }>;
}> {
  const runningTests = await prisma.promptABTest.findMany({
    where: {
      status: "running",
      startDate: { lte: now },
    },
    select: {
      id: true,
      endDate: true,
      name: true,
      autoPromoteWinner: true,
      startDate: true,
      variants: true,
      platform: true,
      format: true,
    },
  });

  const testsEvaluated: string[] = [];
  const testsCompleted: string[] = [];
  const testsCancelled: string[] = [];
  const results: Array<{
    testId: string;
    minSampleReached: boolean;
    pValue: number | null;
    chi2: number | null;
    winnerVariantId: string | null;
    variantStats: unknown[];
  }> = [];

  let recordsUpdated = 0;

  for (const t of runningTests) {
    const missingVer = await getMissingVariantPromptVersionKey(t.variants);
    if (missingVer) {
      await prisma.promptABTest.update({ where: { id: t.id }, data: { status: "paused" } });
      const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
      for (const a of admins) {
        await prisma.notification.create({
          data: {
            userId: a.id,
            type: "ab_test_invalid_prompt",
            title: "A/B test paused",
            body: `Test '${t.name}' references unknown prompt version '${missingVer}'.`,
            actionUrl: `/admin/tests/${t.id}`,
          },
        });
      }
      recordsUpdated += 1;
      continue;
    }

    const traffic7d = await countAssignmentsLastDays(t.id, 7, now);
    const runningLongEnough = now.getTime() - t.startDate.getTime() > 7 * 24 * 60 * 60 * 1000;
    if (traffic7d === 0 && runningLongEnough) {
      await prisma.promptABTest.update({ where: { id: t.id }, data: { status: "paused" } });
      const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
      for (const a of admins) {
        await prisma.notification.create({
          data: {
            userId: a.id,
            type: "ab_test_no_traffic",
            title: "A/B test auto-paused",
            body: `Test '${t.name}' had no assignments in 7 days.`,
            actionUrl: `/admin/tests/${t.id}`,
          },
        });
      }
      emitDesignForgeWebhook("test.completed", {
        testId: t.id,
        testName: t.name,
        platform: t.platform,
        format: t.format,
        reason: "auto_paused_no_traffic",
      });
      recordsUpdated += 1;
      continue;
    }

    const res = await evaluatePromptABTest(t.id, now);
    await incrementAbTestCheckCount(t.id);

    await prisma.aBTestResult.create({
      data: {
        testId: t.id,
        variantResults: res.variantResults as any,
        significanceResult: (res.significanceResult as any) ?? undefined,
        recommendedWinner: res.recommendedWinner ?? null,
        sampleSufficient: !!res.sampleSufficient,
      },
    });

    await prisma.promptABTest.update({
      where: { id: t.id },
      data: { significanceCheckCount: { increment: 1 } },
    });

    emitDesignForgeWebhook("test.result_updated", {
      testId: t.id,
      testName: t.name,
      platform: t.platform,
      format: t.format,
      sampleSufficient: res.sampleSufficient,
      recommendedWinner: res.recommendedWinner ?? null,
    });

    if (res.recommendedWinner) {
      const key = `abtest:winner_webhook:${t.id}`;
      const seen = await redis.get(key);
      if (!seen) {
        await redis.set(key, "1", "EX", 60 * 60 * 24 * 365);
        emitDesignForgeWebhook("test.winner_detected", {
          testId: t.id,
          testName: t.name,
          platform: t.platform,
          format: t.format,
          winnerVariantId: res.recommendedWinner,
          bayesianConfidence: res.bayesianConfidence,
        });
      }
    }

    testsEvaluated.push(t.id);

    results.push({
      testId: t.id,
      minSampleReached: !!res.minSampleReached,
      pValue: res.pValue ?? null,
      chi2: res.chi2 ?? null,
      winnerVariantId: res.recommendedWinner ?? null,
      variantStats: res.variantResults as any[],
    });

    const daysRunning = (now.getTime() - t.startDate.getTime()) / (24 * 60 * 60 * 1000);
    const hasRecommendation = !!(res.recommendedWinner && res.bayesianConfidence != null && daysRunning >= 7);

    if (hasRecommendation && t.autoPromoteWinner && res.recommendedWinner) {
      await prisma.promptABTest.update({
        where: { id: t.id },
        data: {
          status: "completed",
          endDate: t.endDate ?? now,
          winnerVariantId: res.recommendedWinner,
          winnerConfidence: res.bayesianConfidence ?? undefined,
        },
      });
      try {
        await promoteAbTestWinner({
          testId: t.id,
          winnerVariantId: res.recommendedWinner,
          promotedByUserId: null,
        });
      } catch (e) {
        console.error("[abTestEvaluationJob] promoteAbTestWinner failed", e);
      }
      emitDesignForgeWebhook("test.completed", {
        testId: t.id,
        testName: t.name,
        platform: t.platform,
        format: t.format,
        winnerVariantId: res.recommendedWinner,
        autoPromoted: true,
      });
      testsCompleted.push(t.id);
      recordsUpdated += 1;
    } else if (hasRecommendation && !t.autoPromoteWinner && res.recommendedWinner) {
      const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
      const pct = ((res.bayesianConfidence ?? 0) * 100).toFixed(0);
      const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      for (const a of admins) {
        const dup = await prisma.notification.findFirst({
          where: {
            userId: a.id,
            type: "ab_test_winner",
            actionUrl: `/admin/tests/${t.id}`,
            createdAt: { gte: since },
          },
        });
        if (dup) continue;
        await prisma.notification.create({
          data: {
            userId: a.id,
            type: "ab_test_winner",
            title: "A/B test has a winner",
            body: `'${t.name}' — recommended variant with ~${pct}% confidence. Manual review required.`,
            actionUrl: `/admin/tests/${t.id}`,
          },
        });
      }
    }

    if (!res.minSampleReached && t.endDate && t.endDate <= now) {
      await prisma.promptABTest.update({
        where: { id: t.id },
        data: { status: "cancelled", endDate: t.endDate ?? now },
      });
      testsCancelled.push(t.id);
      recordsUpdated += 1;
    }
  }

  return {
    recordsProcessed: runningTests.length,
    recordsUpdated,
    testsEvaluated,
    testsCompleted,
    testsCancelled,
    results,
  };
}
