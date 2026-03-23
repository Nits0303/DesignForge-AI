import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getMinimumPluginVersion, validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await validatePluginBearer(req);
  if (!auth) {
    return fail("UNAUTHORIZED", "Invalid or expired token", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, email: true, avatarUrl: true },
  });
  if (!user) {
    return ok({ valid: false, error: "User not found" });
  }

  const expiresAt = auth.expiresAt;
  const msLeft = expiresAt.getTime() - Date.now();
  const daysLeft = msLeft / (24 * 60 * 60 * 1000);
  const refreshRecommended = daysLeft < 7 && daysLeft > 0;

  return ok({
    valid: true,
    user: {
      name: user.name ?? user.email,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    minimumPluginVersion: getMinimumPluginVersion(),
    tokenExpiresAt: expiresAt.toISOString(),
    tokenExpiresInDays: Math.max(0, Math.round(daysLeft * 10) / 10),
    refreshRecommended,
  });
}
