import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { requireTeamPermission } from "@/lib/auth/teamPermissions";
import { logTeamActivity } from "@/lib/activity/logActivity";

export const runtime = "nodejs";

const postSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
});

function hashInviteToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const session = await getRequiredSession();
    const { teamId } = await ctx.params;
    const json = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid email or role", 400);

    const gate = await requireTeamPermission(teamId, session.user.id, "members:invite");
    if (!gate.allowed) return fail("FORBIDDEN", gate.reason, 403);

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
    if (!team) return fail("NOT_FOUND", "Team not found", 404);

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.teamInvitation.create({
      data: {
        teamId,
        email: parsed.data.email.toLowerCase().trim(),
        role: parsed.data.role,
        tokenHash,
        invitedByUserId: session.user.id,
        expiresAt,
      },
    });

    await logTeamActivity({
      teamId,
      userId: session.user.id,
      eventType: "member.invited",
      resourceTitle: parsed.data.email,
      metadata: { role: parsed.data.role },
    });

    const base =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}` : "");
    const inviteUrl = base ? `${base}/invite/team?token=${rawToken}` : `/invite/team?token=${rawToken}`;

    return ok({ inviteUrl, expiresAt: expiresAt.toISOString(), token: process.env.NODE_ENV === "development" ? rawToken : undefined }, 201);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to create invitation", 500);
  }
}
