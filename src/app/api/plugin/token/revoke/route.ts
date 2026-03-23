import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Deletes all plugin tokens for the current user (disconnect Figma). */
export async function POST() {
  try {
    const session = await getRequiredSession();
    const res = await prisma.pluginToken.deleteMany({ where: { userId: session.user.id } });
    return ok({ deleted: res.count });
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED" || e?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
