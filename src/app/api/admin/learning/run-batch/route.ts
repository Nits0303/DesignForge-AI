import { prisma } from "@/lib/db/prisma";
import { runLearningBatch } from "@/lib/learning/batchRunner";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST() {
  const session = await getRequiredSession().catch(() => null);
  if (!session?.user?.id) return fail("UNAUTHORIZED", "Authentication required", 401);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) return fail("FORBIDDEN", "Admin only", 403);

  const res = await runLearningBatch(new Date());
  return ok(res, 200);
}

