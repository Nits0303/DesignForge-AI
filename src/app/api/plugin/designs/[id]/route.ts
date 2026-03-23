import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await validatePluginBearer(req);
  if (!auth) return fail("UNAUTHORIZED", "Invalid or expired token", 401);

  const { id } = await ctx.params;

  const design = await prisma.design.findFirst({
    where: { id, userId: auth.userId },
    include: {
      brand: {
        select: {
          name: true,
          colors: true,
          typography: true,
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          versionNumber: true,
          createdAt: true,
          isMultiScreen: true,
          screenCount: true,
        },
      },
    },
  });

  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const colors = (design.brand?.colors ?? {}) as Record<string, string>;
  const typo = (design.brand?.typography ?? {}) as Record<string, string>;

  return ok({
    id: design.id,
    title: design.title,
    platform: design.platform,
    format: design.format,
    dimensions: design.dimensions,
    createdAt: design.createdAt.toISOString(),
    currentVersion: design.currentVersion,
    brand: design.brand
      ? {
          name: design.brand.name,
          primaryColor: colors.primary ?? null,
          headingFont: typo.heading ?? typo.headline ?? null,
        }
      : null,
    versions: design.versions.map((v) => ({
      versionNumber: v.versionNumber,
      createdAt: v.createdAt.toISOString(),
      isMultiScreen: v.isMultiScreen,
      screenCount: v.screenCount,
    })),
  });
}
