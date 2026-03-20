import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ designId: string }> }) {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const { designId } = await context.params;

  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    select: { id: true },
  });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const exports = await prisma.export.findMany({
    where: { designId },
    orderBy: { createdAt: "desc" },
    select: { id: true, format: true, versionNumber: true, fileUrl: true, fileSizeBytes: true, createdAt: true, figmaUrl: true },
  });

  return ok({ designId, exports });
}

