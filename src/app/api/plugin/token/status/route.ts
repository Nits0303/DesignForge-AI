import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const now = new Date();
    const tokens = await prisma.pluginToken.findMany({
      where: { userId: session.user.id, expiresAt: { gt: now } },
      select: { id: true, name: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return ok({
      connected: tokens.length > 0,
      tokens,
    });
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED" || e?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
