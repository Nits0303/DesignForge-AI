import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try {
    const session = await getRequiredSession();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, googleId: true, passwordHash: true },
    });

    if (!user) return fail("NOT_FOUND", "User not found", 404);
    if (!user.googleId) return fail("NOT_FOUND", "Google account is not connected.", 400);
    if (!user.passwordHash) return fail("NO_PASSWORD", "Enable email/password login before disconnecting Google.", 400);

    await prisma.user.update({
      where: { id: user.id },
      data: { googleId: null, authProvider: "email" },
    });

    return ok({ disconnected: true }, 200);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

