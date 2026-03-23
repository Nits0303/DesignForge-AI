import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email("Valid email is required"),
});

export async function DELETE(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid confirmation payload", 400);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true },
    });
    if (!user) return fail("NOT_FOUND", "User not found", 404);

    const ownedTeams = await prisma.team.count({ where: { ownerUserId: user.id } });
    if (ownedTeams > 0) {
      return fail(
        "TEAM_OWNERSHIP",
        "You own one or more teams. Transfer ownership or delete those teams before scheduling account deletion.",
        400
      );
    }

    if (parsed.data.email.toLowerCase() !== String(user.email).toLowerCase()) {
      return fail("CONFIRMATION_FAILED", "Email does not match your account.", 400);
    }

    const now = new Date();
    const purgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.userPreference.upsert({
      where: {
        userId_preferenceKey: {
          userId: user.id,
          preferenceKey: "account_deletion_requested_at",
        },
      },
      create: {
        userId: user.id,
        preferenceKey: "account_deletion_requested_at",
        preferenceValue: now.toISOString(),
      },
      update: { preferenceValue: now.toISOString() },
    });
    await prisma.userPreference.upsert({
      where: {
        userId_preferenceKey: {
          userId: user.id,
          preferenceKey: "account_deletion_permanent_at",
        },
      },
      create: {
        userId: user.id,
        preferenceKey: "account_deletion_permanent_at",
        preferenceValue: purgeAt.toISOString(),
      },
      update: { preferenceValue: purgeAt.toISOString() },
    });

    return ok({ scheduled: true, permanentDeletionAt: purgeAt.toISOString() }, 200);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

