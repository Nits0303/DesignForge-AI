import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logTeamActivity } from "@/lib/activity/logActivity";

export const runtime = "nodejs";

function baseSlug(input: string) {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "team";
}

const createTeamSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(64).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const json = await req.json().catch(() => ({}));
    const parsed = createTeamSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid team name or slug", 400);

    const { name, slug: slugInput } = parsed.data;
    let slug = slugInput ? baseSlug(slugInput) : baseSlug(name);

    let candidate = slug;
    for (let i = 0; i < 24; i++) {
      const exists = await prisma.team.findUnique({ where: { slug: candidate } });
      if (!exists) break;
      candidate = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const team = await prisma.$transaction(async (tx) => {
      const t = await tx.team.create({
        data: {
          name: name.trim(),
          slug: candidate,
          ownerUserId: session.user.id,
        },
      });
      await tx.teamMember.create({
        data: {
          teamId: t.id,
          userId: session.user.id,
          role: "owner",
        },
      });
      return t;
    });

    await logTeamActivity({
      teamId: team.id,
      userId: session.user.id,
      eventType: "team.created",
      resourceId: team.id,
      resourceTitle: team.name,
    });

    return ok(
      {
        team: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          plan: team.plan,
          createdAt: team.createdAt,
        },
      },
      201
    );
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to create team", 500);
  }
}

export async function GET() {
  try {
    const session = await getRequiredSession();
    const members = await prisma.teamMember.findMany({
      where: { userId: session.user.id },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            plan: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    const teams = members.map((m) => ({
      role: m.role,
      id: m.team.id,
      name: m.team.name,
      slug: m.team.slug,
      logoUrl: m.team.logoUrl,
      plan: m.team.plan,
      createdAt: m.team.createdAt,
      memberCount: m.team._count.members,
    }));

    return ok({ teams }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to load teams", 500);
  }
}
