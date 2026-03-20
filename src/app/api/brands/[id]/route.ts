import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { getStorageService, storagePathFromPublicUrl } from "@/lib/storage";
import { getBrandProfile, invalidateBrandCache } from "@/lib/db/brandQueries";

export const runtime = "nodejs";

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex value (e.g. #112233)");

const putSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().nullish(),
  toneVoice: z.string().max(500).nullish(),
  colors: z
    .object({
      primary: hex.optional(),
      secondary: hex.optional(),
      accent: hex.optional(),
      background: hex.optional(),
      text: hex.optional(),
    })
    .partial()
    .optional(),
  typography: z
    .object({
      headingFont: z.string().min(1).optional(),
      bodyFont: z.string().min(1).optional(),
      headingWeight: z.number().optional(),
      bodyWeight: z.number().optional(),
    })
    .partial()
    .optional(),
  logoPrimaryUrl: z.string().nullish(),
  logoIconUrl: z.string().nullish(),
  logoDarkUrl: z.string().nullish(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;

    const brand = await getBrandProfile(id, session.user.id);
    if (!brand) return fail("NOT_FOUND", "Not found", 404);

    const grouped = (brand as any).assets.reduce((acc: Record<string, any[]>, a: any) => {
      acc[a.category] = acc[a.category] ?? [];
      acc[a.category].push(a);
      return acc;
    }, {});

    return ok({ ...brand, assetsByCategory: grouped });
  } catch (err) {
    console.error("Brand GET error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return fail("VALIDATION_ERROR", msg, 400);
    }

    const existing = await prisma.brandProfile.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, colors: true, typography: true },
    });
    if (!existing) return fail("NOT_FOUND", "Not found", 404);

    const nextColors = parsed.data.colors
      ? { ...(existing.colors as any), ...(parsed.data.colors as any) }
      : undefined;
    const nextTypography = parsed.data.typography
      ? { ...(existing.typography as any), ...(parsed.data.typography as any) }
      : undefined;

    const updated = await prisma.brandProfile.update({
      where: { id },
      data: {
        name: parsed.data.name,
        industry: parsed.data.industry ?? undefined,
        toneVoice: parsed.data.toneVoice ?? undefined,
        colors: nextColors ?? undefined,
        typography: nextTypography ?? undefined,
        logoPrimaryUrl: parsed.data.logoPrimaryUrl ?? undefined,
        logoIconUrl: parsed.data.logoIconUrl ?? undefined,
        logoDarkUrl: parsed.data.logoDarkUrl ?? undefined,
      },
    });

    await invalidateBrandCache(id, session.user.id);
    return ok(updated);
  } catch (err) {
    console.error("Brand PUT error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;

    const brand = await prisma.brandProfile.findFirst({
      where: { id, userId: session.user.id },
      include: { assets: true },
    });
    if (!brand) return fail("NOT_FOUND", "Not found", 404);

    const storage = getStorageService();
    for (const a of brand.assets) {
      const storagePath = storagePathFromPublicUrl(a.fileUrl);
      if (storagePath) {
        try {
          await storage.delete(storagePath);
        } catch {}
      }
    }

    await prisma.brandAsset.deleteMany({ where: { brandId: brand.id } });
    await prisma.brandProfile.delete({ where: { id: brand.id } });

    if (brand.isDefault) {
      const next = await prisma.brandProfile.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await prisma.brandProfile.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    await invalidateBrandCache(id, session.user.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("Brand DELETE error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

