import AnalyticsPageClient from "./AnalyticsPageClient";
import { type AnalyticsPeriod } from "@/lib/analytics/period";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: AnalyticsPeriod }>;
}) {
  const params = await searchParams;
  const period = params?.period ?? "30d";
  return <AnalyticsPageClient initialPeriod={period} />;
}

