import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;
    const ref = await prisma.referenceImage.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!ref) return fail("NOT_FOUND", "Reference not found", 404);

    const updated = await prisma.referenceImage.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: {
        id: true,
        name: true,
        visionUrl: true,
        thumbnailUrl: true,
        analysisJson: true,
        updatedAt: true,
      },
    });
    return ok(updated);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "Failed to activate reference", 500);
  }
}

