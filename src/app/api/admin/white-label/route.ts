import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  isEnabled: z.boolean().optional(),
  appName: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  supportEmail: z.string().email().nullable().optional(),
  privacyPolicyUrl: z.string().url().nullable().optional(),
  termsUrl: z.string().url().nullable().optional(),
  hidePoweredBy: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return fail("UNAUTHORIZED", "Sign in required", 401);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
  if (!user?.isAdmin) return fail("FORBIDDEN", "Admin only", 403);

  const row = await prisma.whiteLabelConfig.findUnique({ where: { id: "default" } });
  return ok({ config: row }, 200);
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("UNAUTHORIZED", "Sign in required", 401);
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
    if (!user?.isAdmin) return fail("FORBIDDEN", "Admin only", 403);

    const json = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.message, 400);

    const d = parsed.data;
    const updated = await prisma.whiteLabelConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        isEnabled: d.isEnabled ?? false,
        appName: d.appName ?? "DesignForge AI",
        logoUrl: d.logoUrl ?? null,
        faviconUrl: d.faviconUrl ?? null,
        primaryColor: d.primaryColor ?? null,
        supportEmail: d.supportEmail ?? null,
        privacyPolicyUrl: d.privacyPolicyUrl ?? null,
        termsUrl: d.termsUrl ?? null,
        hidePoweredBy: d.hidePoweredBy ?? false,
      },
      update: {
        ...(d.isEnabled !== undefined ? { isEnabled: d.isEnabled } : {}),
        ...(d.appName !== undefined ? { appName: d.appName } : {}),
        ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl } : {}),
        ...(d.faviconUrl !== undefined ? { faviconUrl: d.faviconUrl } : {}),
        ...(d.primaryColor !== undefined ? { primaryColor: d.primaryColor } : {}),
        ...(d.supportEmail !== undefined ? { supportEmail: d.supportEmail } : {}),
        ...(d.privacyPolicyUrl !== undefined ? { privacyPolicyUrl: d.privacyPolicyUrl } : {}),
        ...(d.termsUrl !== undefined ? { termsUrl: d.termsUrl } : {}),
        ...(d.hidePoweredBy !== undefined ? { hidePoweredBy: d.hidePoweredBy } : {}),
      },
    });

    return ok({ config: updated }, 200);
  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", "Update failed", 500);
  }
}
