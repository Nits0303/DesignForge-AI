import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await ctx.params;

    const col = await prisma.templateCollection.findFirst({
      where: { id, isPublic: true },
    });
    if (!col) return fail("NOT_FOUND", "Collection not found", 404);

    const ids = Array.isArray(col.templateIds) ? (col.templateIds as string[]) : [];
    const approved = await prisma.template.findMany({
      where: {
        id: { in: ids },
        submissionStatus: "approved",
        isActive: true,
        marketplaceQualityFlagged: false,
      },
      select: { id: true },
    });
    const approvedIds = approved.map((t) => t.id);

    let installed = 0;
    for (const templateId of approvedIds) {
      const existing = await prisma.templateInstallation.findUnique({
        where: { userId_templateId: { userId: session.user.id, templateId } },
      });
      if (existing?.isActive) continue;

      await prisma.$transaction(async (tx) => {
        if (existing && !existing.isActive) {
          await tx.templateInstallation.update({
            where: { id: existing.id },
            data: { isActive: true },
          });
        } else if (!existing) {
          await tx.templateInstallation.create({
            data: { userId: session.user.id, templateId, isActive: true },
          });
        }
        await tx.$executeRaw(
          Prisma.sql`UPDATE "Template" SET "installCount" = "installCount" + 1 WHERE id = ${templateId}`
        );
      });
      installed += 1;
    }

    await invalidateMarketplaceListCache();
    return ok({ installedCount: installed, templateIds: approvedIds }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Install failed", 500);
  }
}
