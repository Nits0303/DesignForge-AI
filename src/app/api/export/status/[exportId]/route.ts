import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ exportId: string }> }) {
  const session = await getRequiredSession();
  const userId = session.user.id;

  const { exportId } = await context.params;

  const job = await prisma.exportJob.findUnique({
    where: { id: exportId },
    include: { design: { select: { userId: true } } },
  });
  if (!job || job.design.userId !== userId) {
    return fail("NOT_FOUND", "Export job not found", 404);
  }

  return ok({
    exportId,
    status: job.status,
    resultUrl: job.resultUrl,
    errorMessage: job.errorMessage,
  });
}

