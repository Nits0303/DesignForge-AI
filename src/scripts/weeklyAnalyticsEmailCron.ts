import cron from "node-cron";
import { runWeeklyAnalyticsEmailJob } from "@/lib/analytics/weeklyEmail";

// Every Monday at 08:00 UTC
cron.schedule(
  "0 8 * * 1",
  () => {
    runWeeklyAnalyticsEmailJob(new Date()).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[weekly-analytics-email-cron] failed", err);
    });
  },
  { timezone: "UTC" }
);

// eslint-disable-next-line no-console
console.log("[weekly-analytics-email-cron] scheduled");

