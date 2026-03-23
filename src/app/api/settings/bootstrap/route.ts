import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;

    const [totalDesigns, sum, user] = await Promise.all([
      prisma.design.count({ where: { userId } }),
      prisma.generationLog.aggregate({
        where: { userId, wasApproved: { not: null } },
        _sum: { revisionCount: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          authProvider: true,
          googleId: true,
          passwordHash: true,
        },
      }),
    ]);

    if (!user) return fail("NOT_FOUND", "User not found", 404);
    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        googleId: user.googleId,
        hasEmailPassword: !!user.passwordHash,
      },
      totalDesigns,
      totalRevisions: sum._sum.revisionCount ?? 0,
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

