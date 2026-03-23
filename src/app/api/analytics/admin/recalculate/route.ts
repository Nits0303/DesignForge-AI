import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { runLearningBatch } from "@/lib/learning/batchRunner";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getRequiredSession();
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
    if (!user?.isAdmin) return fail("FORBIDDEN", "Admin only", 403);

    const res = await runLearningBatch(new Date());
    return ok(res, 200);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    // Avoid leaking details.
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

