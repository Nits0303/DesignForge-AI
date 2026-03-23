import crypto from "crypto";

function hashUserId(userId: string) {
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

function safeJson(v: any) {
  return v ?? null;
}

export async function auditLogJob(args: {
  runDate: Date;
  orphanCleanupResult: any;
  promptScoreResult: any;
  abTestEvaluationResult: any;
  templateApprovalResult: any;
  revisionPatternResult: any;
  preferenceInferenceResult: any;
  userQualityMetricsResult: any;
  globalPatternResult: any;
  contributorReputationResult?: any;
  marketplaceQualityResult?: any;
}) {
  const {
    orphanCleanupResult,
    promptScoreResult,
    abTestEvaluationResult,
    templateApprovalResult,
    revisionPatternResult,
    preferenceInferenceResult,
    userQualityMetricsResult,
    globalPatternResult,
    contributorReputationResult,
    marketplaceQualityResult,
  } = args;

  const auditDetails = {
    summary: {
      recordsProcessed:
        (orphanCleanupResult?.recordsProcessed ?? 0) +
        (promptScoreResult?.recordsProcessed ?? 0) +
        (templateApprovalResult?.recordsProcessed ?? 0) +
        (revisionPatternResult?.recordsProcessed ?? 0) +
        (preferenceInferenceResult?.recordsProcessed ?? 0) +
        (globalPatternResult?.recordsProcessed ?? 0) +
        (contributorReputationResult?.recordsProcessed ?? 0) +
        (marketplaceQualityResult?.recordsProcessed ?? 0),
      recordsUpdated:
        (orphanCleanupResult?.recordsUpdated ?? 0) +
        (promptScoreResult?.recordsUpdated ?? 0) +
        (templateApprovalResult?.recordsUpdated ?? 0) +
        (revisionPatternResult?.recordsUpdated ?? 0) +
        (preferenceInferenceResult?.recordsUpdated ?? 0) +
        (globalPatternResult?.recordsUpdated ?? 0) +
        (contributorReputationResult?.recordsUpdated ?? 0) +
        (marketplaceQualityResult?.recordsUpdated ?? 0),
      preferenceChanges: {
        createdCount: preferenceInferenceResult?.createdCount ?? 0,
        updatedCount: preferenceInferenceResult?.updatedCount ?? 0,
        deletedCount: preferenceInferenceResult?.deletedCount ?? 0,
      },
      promptScoreUpdates: (promptScoreResult?.promptScoreUpdates ?? []).length,
      abTestsEvaluated: (abTestEvaluationResult?.testsEvaluated ?? []).length,
      abTestsCompleted: (abTestEvaluationResult?.testsCompleted ?? []).length,
      abTestsCancelled: (abTestEvaluationResult?.testsCancelled ?? []).length,
      templateApprovalChanges: (templateApprovalResult?.changedTemplates ?? []).length,
      newlyDetectedGlobalPatterns: (revisionPatternResult?.newlyDetectedGlobalPatterns ?? []).length,
      templateRecommendationsCreated: globalPatternResult?.templateRecommendationsCreated ?? 0,
      decliningPromptPlatforms: globalPatternResult?.decliningPromptPlatforms ?? [],
      costOverrunFindings: globalPatternResult?.costOverrunFindings ?? [],
      learningEffectivenessSignal: userQualityMetricsResult?.comparison ?? null,
      contributorReputation: contributorReputationResult?.error
        ? { error: String(contributorReputationResult.error) }
        : {
            contributorsProcessed: contributorReputationResult?.recordsProcessed ?? 0,
            contributorsUpdated: contributorReputationResult?.recordsUpdated ?? 0,
          },
      marketplaceQualityFlags: marketplaceQualityResult?.error
        ? { error: String(marketplaceQualityResult.error) }
        : {
            templatesProcessed: marketplaceQualityResult?.recordsProcessed ?? 0,
            templatesFlagged: marketplaceQualityResult?.recordsUpdated ?? 0,
          },
      jobErrors: [],
    },
    preferencesChangeLog: (preferenceInferenceResult?.preferenceChanges ?? []).map((c: any) => ({
      userIdHash: hashUserId(c.userId),
      preferenceKey: c.preferenceKey,
      oldValue: safeJson(c.oldValue),
      newValue: safeJson(c.newValue),
      oldConfidence: c.oldConfidence ?? null,
      newConfidence: c.newConfidence,
      trigger: c.trigger,
      manualOverrideSkipped: c.manualOverrideSkipped ?? false,
    })),
    promptScoreChangeLog: (promptScoreResult?.promptScoreUpdates ?? []).map((u: any) => ({
      platform: u.platform,
      format: u.format,
      promptStructureHash: u.promptStructureHash,
      oldScore: u.oldScore,
      newScore: u.newScore,
      delta: (u.oldScore == null ? null : u.newScore - u.oldScore),
      decidedCount: u.decidedCount,
      totalUses: u.totalUses,
    })),
    templateApprovalChangeLog: (templateApprovalResult?.changedTemplates ?? []).map((t: any) => ({
      templateId: t.templateId,
      oldRate: t.oldRate,
      newRate: t.newRate,
    })),
    abTestEvaluationResults: abTestEvaluationResult?.results ?? [],
    revisionPatternGlobalDetections: revisionPatternResult?.newlyDetectedGlobalPatterns ?? [],
    notes: revisionPatternResult?.globalPatternNotes ?? [],
  };

  return {
    recordsProcessed: 0,
    recordsUpdated: 0,
    auditDetails,
  };
}

