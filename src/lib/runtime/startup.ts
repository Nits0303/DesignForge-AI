let started = false;

export function ensureBackgroundCronsStarted() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (started) return;
  started = true;
  void import("@/scripts/weeklyAnalyticsEmailCron");
  void import("@/scripts/accountDeletionPurgeCron");
}

