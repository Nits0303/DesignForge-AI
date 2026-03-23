import cron from "node-cron";
import { runLearningBatch } from "@/lib/learning/batchRunner";

cron.schedule(
  "0 2 * * *",
  () => {
    runLearningBatch(new Date()).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[learning-batch-cron] failed", err);
    });
  },
  { timezone: "UTC" }
);

// eslint-disable-next-line no-console
console.log("[learning-batch-cron] scheduled");

