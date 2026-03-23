import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { requireTeamPermission } from "@/lib/auth/teamPermissions";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const session = await getRequiredSession();
    const { teamId } = await ctx.params;
    const gate = await requireTeamPermission(teamId, session.user.id, "analytics:view");
    if (!gate.allowed) {
      const v = await requireTeamPermission(teamId, session.user.id, "designs:view_all");
      if (!v.allowed) return fail("FORBIDDEN", gate.reason, 403);
    }

    const sp = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "40", 10) || 40));

    const rows = await prisma.activityLog.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return ok({ items: rows }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to load activity", 500);
  }
}
