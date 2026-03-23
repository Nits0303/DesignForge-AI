import { prisma } from "@/lib/db/prisma";

function preferenceJsonToOptIn(v: unknown): boolean {
  if (v === false) return false;
  if (v === true) return true;
  // Legacy / odd shapes: default to opt-in unless explicitly false
  return true;
}

/** Marketplace-related notification toggles (default true). */
export async function userWantsMarketplaceNotification(
  userId: string,
  key: "notify_template_installed" | "notify_template_rated"
): Promise<boolean> {
  const p = await prisma.userPreference.findUnique({
    where: { userId_preferenceKey: { userId, preferenceKey: key } },
  });
  if (!p) return true;
  return preferenceJsonToOptIn(p.preferenceValue);
}
