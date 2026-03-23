import cron from "node-cron";
import { prisma } from "@/lib/db/prisma";

async function runAccountDeletionPurge(now = new Date()) {
  const prefs = await prisma.userPreference.findMany({
    where: { preferenceKey: "account_deletion_permanent_at" },
    select: { userId: true, preferenceValue: true },
    take: 5000,
  });

  const userIds = prefs
    .filter((p) => {
      const raw = p.preferenceValue as any;
      if (typeof raw !== "string") return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime();
    })
    .map((p) => p.userId);

  if (!userIds.length) return;

  // Sprint 17: keep marketplace templates live; detach contributor identity.
  await prisma.template.updateMany({
    where: { contributorUserId: { in: userIds } },
    data: { contributorUserId: null, source: "community_legacy" },
  });

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

// Daily at 02:00 UTC
cron.schedule(
  "0 2 * * *",
  () => {
    runAccountDeletionPurge().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[account-deletion-purge-cron] failed", err);
    });
  },
  { timezone: "UTC" }
);

// eslint-disable-next-line no-console
console.log("[account-deletion-purge-cron] scheduled");

