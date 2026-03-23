import { prisma } from "@/lib/db/prisma";

export async function getScheduledDeletionDate(userId: string): Promise<Date | null> {
  const pref = await prisma.userPreference.findUnique({
    where: {
      userId_preferenceKey: {
        userId,
        preferenceKey: "account_deletion_permanent_at",
      },
    },
    select: { preferenceValue: true },
  });
  const raw = pref?.preferenceValue as any;
  const iso = typeof raw === "string" ? raw : null;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function isAccountPendingDeletion(userId: string): Promise<boolean> {
  const d = await getScheduledDeletionDate(userId);
  return Boolean(d && d.getTime() > Date.now());
}

