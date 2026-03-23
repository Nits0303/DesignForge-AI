export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export function getPeriodRange(period: AnalyticsPeriod, now = new Date()): {
  start: Date | null;
  end: Date;
} {
  const end = new Date(now);

  if (period === "all") return { start: null, end };

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function getPreviousPeriodRange(period: AnalyticsPeriod, now = new Date()): {
  start: Date | null;
  end: Date;
} | null {
  if (period === "all") return null;

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const end = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const start = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function periodToDateWhereClauses(period: AnalyticsPeriod) {
  // Helper for codegen-ish consistency.
  // Note: used only when period !== "all".
  const range = getPeriodRange(period);
  if (!range.start) return {};
  return { gte: range.start, lt: range.end };
}

