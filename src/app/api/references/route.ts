import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const refs = await prisma.referenceImage.findMany({
      where: { userId: session.user.id, isSaved: true },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        originalFilename: true,
        thumbnailUrl: true,
        analysisJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return ok(refs);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "Failed to load references", 500);
  }
}

