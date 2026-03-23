import { prisma } from "@/lib/db/prisma";

import { orphanCleanupJob } from "@/lib/learning/jobs/orphanCleanupJob";
import { promptScoreJob } from "@/lib/learning/jobs/promptScoreJob";
import { templateApprovalJob } from "@/lib/learning/jobs/templateApprovalJob";
import { revisionPatternJob } from "@/lib/learning/jobs/revisionPatternJob";
import { preferenceInferenceJob } from "@/lib/learning/jobs/preferenceInferenceJob";
import { globalPatternJob } from "@/lib/learning/jobs/globalPatternJob";
import { auditLogJob } from "@/lib/learning/jobs/auditLogJob";
import { userQualityMetricsJob } from "@/lib/learning/jobs/userQualityMetricsJob";
import { abTestEvaluationJob } from "@/lib/learning/jobs/abTestEvaluationJob";
import { abTestSuggesterJob } from "@/lib/learning/abTestSuggester";
import { contributorReputationJob } from "@/lib/learning/jobs/contributorReputationJob";
import { marketplaceQualityJob } from "@/lib/learning/jobs/marketplaceQualityJob";
import { invalidateAnalyticsCaches } from "@/lib/analytics/cache";
import { upsertDailySystemMetric } from "@/lib/analytics/dailySnapshots";

function startOfUtcDate(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function writeBatchLogRow(params: {
  runDate: Date;
  jobName: string;
  status: "success" | "failed" | "partial";
  recordsProcessed: number;
  recordsUpdated: number;
  durationMs: number;
  errorMessage?: string | null;
  auditDetails?: any;
}) {
  // Map our textual statuses to enum values in Prisma.
  const status =
    params.status === "success"
      ? "success"
      : params.status === "partial"
        ? "partial"
        : "failed";

  await prisma.learningBatchLog.create({
    data: {
      runDate: params.runDate,
      jobName: params.jobName,
      status,
      recordsProcessed: params.recordsProcessed,
      recordsUpdated: params.recordsUpdated,
      durationMs: params.durationMs,
      errorMessage: params.errorMessage ?? null,
      auditDetails: params.auditDetails ?? null,
    },
  });
}

export async function runLearningBatch(now = new Date()): Promise<{
  runDate: Date;
  results: Record<string, any>;
}> {
  const runDate = startOfUtcDate(now);
  const results: Record<string, any> = {};

  const jobSpecs: Array<{
    jobName: string;
    fn: () => Promise<any>;
  }> = [
    { jobName: "orphan_cleanup", fn: () => orphanCleanupJob(now) },
    { jobName: "prompt_score_recalc", fn: () => promptScoreJob(now) },
    { jobName: "ab_test_evaluation", fn: () => abTestEvaluationJob(now) },
    { jobName: "ab_test_suggestions", fn: () => abTestSuggesterJob(now) },
    { jobName: "template_approval_rate_recalc", fn: () => templateApprovalJob(now) },
    { jobName: "revision_pattern_aggregation", fn: () => revisionPatternJob(now) },
    { jobName: "preference_inference", fn: () => preferenceInferenceJob(now) },
    { jobName: "user_quality_metrics", fn: () => userQualityMetricsJob(now) },
    { jobName: "global_pattern_analysis", fn: () => globalPatternJob(now) },
    { jobName: "contributor_reputation", fn: () => contributorReputationJob(now) },
    { jobName: "marketplace_quality_flags", fn: () => marketplaceQualityJob(now) },
  ];

  // 1-6: continue on failure.
  for (const spec of jobSpecs) {
    const startedAt = Date.now();
    try {
      const res = await spec.fn();
      const durationMs = Date.now() - startedAt;
      results[spec.jobName] = res;
      await writeBatchLogRow({
        runDate,
        jobName: spec.jobName,
        status: "success",
        recordsProcessed: res?.recordsProcessed ?? 0,
        recordsUpdated: res?.recordsUpdated ?? 0,
        durationMs,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = err?.message ? String(err.message) : "Job failed";
      results[spec.jobName] = { error: errorMessage };
      await writeBatchLogRow({
        runDate,
        jobName: spec.jobName,
        status: "failed",
        recordsProcessed: 0,
        recordsUpdated: 0,
        durationMs,
        errorMessage,
      });
      // continue
    }
  }

  // 7: write consolidated audit details as the final log row.
  const startedAt = Date.now();
  let auditDetails: any = null;
  try {
    const res = await auditLogJob({
      runDate,
      orphanCleanupResult: results["orphan_cleanup"],
      promptScoreResult: results["prompt_score_recalc"],
      abTestEvaluationResult: results["ab_test_evaluation"],
      templateApprovalResult: results["template_approval_rate_recalc"],
      revisionPatternResult: results["revision_pattern_aggregation"],
      preferenceInferenceResult: results["preference_inference"],
      userQualityMetricsResult: results["user_quality_metrics"],
      globalPatternResult: results["global_pattern_analysis"],
      contributorReputationResult: results["contributor_reputation"],
      marketplaceQualityResult: results["marketplace_quality_flags"],
    });
    auditDetails = res?.auditDetails ?? null;
    results["learning_engine_audit"] = res;
    await writeBatchLogRow({
      runDate,
      jobName: "learning_engine_audit",
      status: "success",
      recordsProcessed: res?.recordsProcessed ?? 0,
      recordsUpdated: res?.recordsUpdated ?? 0,
      durationMs: Date.now() - startedAt,
      auditDetails,
    });
  } catch (err: any) {
    await writeBatchLogRow({
      runDate,
      jobName: "learning_engine_audit",
      status: "failed",
      recordsProcessed: 0,
      recordsUpdated: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: err?.message ? String(err.message) : "Audit job failed",
    });
  }

  // Analytics queries are cached aggressively; invalidate after learning updates.
  try {
    await upsertDailySystemMetric(now);
    await invalidateAnalyticsCaches();
  } catch {
    // best effort
  }

  return { runDate, results };
}


