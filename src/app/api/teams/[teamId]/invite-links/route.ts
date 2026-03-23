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
  role: z.enum(["admin", "editor", "viewer"]),
  expiresInDays: z.number().min(1).max(90).optional(),
});

function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const session = await getRequiredSession();
    const { teamId } = await ctx.params;
    const json = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const gate = await requireTeamPermission(teamId, session.user.id, "members:invite");
    if (!gate.allowed) return fail("FORBIDDEN", gate.reason, 403);

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) return fail("NOT_FOUND", "Team not found", 404);

    const raw = randomBytes(24).toString("hex");
    const tokenHash = hashToken(raw);
    const days = parsed.data.expiresInDays ?? 14;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.teamInviteLink.create({
      data: {
        teamId,
        tokenHash,
        role: parsed.data.role,
        expiresAt,
        createdByUserId: session.user.id,
      },
    });

    await logTeamActivity({
      teamId,
      userId: session.user.id,
      eventType: "invite_link.created",
      metadata: { role: parsed.data.role, expiresInDays: days },
    });

    const fromVercel = process.env.VERCEL_URL
      ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, "")}`
      : "";
    const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || fromVercel;
    const url = base ? `${base}/invite/team?token=${raw}` : `/invite/team?token=${raw}`;

    return ok({ inviteUrl: url, expiresAt: expiresAt.toISOString(), token: process.env.NODE_ENV === "development" ? raw : undefined }, 201);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
