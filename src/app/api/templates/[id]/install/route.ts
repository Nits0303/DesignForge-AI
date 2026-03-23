import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { invalidateMarketplaceDetailCache, invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";
import { recordInstallForDigest } from "@/lib/marketplace/installDigest";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id: templateId } = await ctx.params;

    const tpl = await prisma.template.findFirst({
      where: { id: templateId, submissionStatus: "approved", isActive: true },
    });
    if (!tpl) return fail("NOT_FOUND", "Template not found", 404);
    if (tpl.marketplaceQualityFlagged) {
      return fail("UNAVAILABLE", "This template is temporarily unavailable", 403);
    }

    const existing = await prisma.templateInstallation.findUnique({
      where: { userId_templateId: { userId: session.user.id, templateId } },
    });
    if (existing?.isActive) {
      return fail("CONFLICT", "Already installed", 409);
    }

    if (existing && !existing.isActive) {
      await prisma.$transaction([
        prisma.templateInstallation.update({
          where: { id: existing.id },
          data: { isActive: true },
        }),
        prisma.$executeRaw(Prisma.sql`UPDATE "Template" SET "installCount" = "installCount" + 1 WHERE id = ${templateId}`),
      ]);
      const row = await prisma.templateInstallation.findUnique({ where: { id: existing.id } });
      await invalidateMarketplaceDetailCache(templateId);
      await invalidateMarketplaceListCache();
      void recordInstallForDigest(templateId);
      return ok({ installation: row }, 200);
    }

    await prisma.$transaction([
      prisma.templateInstallation.create({
        data: { userId: session.user.id, templateId, isActive: true },
      }),
      prisma.$executeRaw(Prisma.sql`UPDATE "Template" SET "installCount" = "installCount" + 1 WHERE id = ${templateId}`),
    ]);

    const installation = await prisma.templateInstallation.findUnique({
      where: { userId_templateId: { userId: session.user.id, templateId } },
    });
    await invalidateMarketplaceDetailCache(templateId);
    await invalidateMarketplaceListCache();
    void recordInstallForDigest(templateId);
    return ok({ installation }, 201);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Install failed", 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id: templateId } = await ctx.params;

    const existing = await prisma.templateInstallation.findUnique({
      where: { userId_templateId: { userId: session.user.id, templateId } },
    });
    if (!existing?.isActive) {
      return fail("NOT_FOUND", "Not installed", 404);
    }

    await prisma.$transaction([
      prisma.templateInstallation.update({
        where: { id: existing.id },
        data: { isActive: false },
      }),
      prisma.$executeRaw(
        Prisma.sql`UPDATE "Template" SET "installCount" = GREATEST("installCount" - 1, 0) WHERE id = ${templateId}`
      ),
    ]);

    await invalidateMarketplaceDetailCache(templateId);
    await invalidateMarketplaceListCache();
    return new Response(null, { status: 204 });
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    return fail("INTERNAL_ERROR", "Uninstall failed", 500);
  }
}
