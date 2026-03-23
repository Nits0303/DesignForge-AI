import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { invalidateTeamMemberRoleCache } from "@/lib/auth/teamPermissions";
import { logTeamActivity } from "@/lib/activity/logActivity";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(16),
});

function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid token", 400);

    const tokenHash = hashToken(parsed.data.token);
    const now = new Date();
    const userEmail = String(session.user.email ?? "").toLowerCase();

    const inv = await prisma.teamInvitation.findUnique({
      where: { tokenHash },
      include: { team: { select: { id: true, name: true } } },
    });
    if (inv && (inv.acceptedAt || inv.expiresAt <= now)) {
      return fail("INVALID_TOKEN", "Invitation already used or expired.", 400);
    }

    if (inv) {
      if (inv.email.toLowerCase() !== userEmail) {
        return fail("EMAIL_MISMATCH", "Sign in with the invited email address to accept.", 400);
      }
      await prisma.$transaction(async (tx) => {
        await tx.teamInvitation.update({
          where: { id: inv.id },
          data: { acceptedAt: now },
        });
        await tx.teamMember.upsert({
          where: { teamId_userId: { teamId: inv.teamId, userId: session.user.id } },
          create: {
            teamId: inv.teamId,
            userId: session.user.id,
            role: inv.role,
            invitedByUserId: inv.invitedByUserId,
          },
          update: { role: inv.role },
        });
      });
      await invalidateTeamMemberRoleCache(inv.teamId, session.user.id);
      await logTeamActivity({
        teamId: inv.teamId,
        userId: session.user.id,
        eventType: "member.joined",
        resourceTitle: userEmail,
        metadata: { via: "email_invite" },
      });
      return ok({ teamId: inv.teamId, teamName: inv.team.name, role: inv.role }, 200);
    }

    const link = await prisma.teamInviteLink.findUnique({
      where: { tokenHash },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!link || link.expiresAt <= now) {
      return fail("INVALID_TOKEN", "Invitation not found or expired.", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: link.teamId, userId: session.user.id } },
        create: {
          teamId: link.teamId,
          userId: session.user.id,
          role: link.role,
          invitedByUserId: link.createdByUserId,
        },
        update: {},
      });
    });
    await invalidateTeamMemberRoleCache(link.teamId, session.user.id);
    await logTeamActivity({
      teamId: link.teamId,
      userId: session.user.id,
      eventType: "member.joined",
      metadata: { via: "invite_link" },
    });

    return ok({ teamId: link.teamId, teamName: link.team.name, role: link.role }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to accept invite", 500);
  }
}
