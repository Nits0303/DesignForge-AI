import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import {
  computeMinimumDetectableEffectAbsolute,
  mdeRelativeToBaseline,
} from "@/lib/learning/abTestMde";

export const runtime = "nodejs";

function sumAlloc(variants: { allocationPercent?: number }[]) {
  return variants.reduce((a, v) => a + Number(v.allocationPercent ?? 0), 0);
}

export async function GET() {
  try {
    await requireAdminUser();
    const tests = await prisma.promptABTest.findMany({
      orderBy: { startDate: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        platform: true,
        format: true,
        status: true,
        startDate: true,
        endDate: true,
        minSamplesPerVariant: true,
        variants: true,
        createdAt: true,
        autoPromoteWinner: true,
      },
    });
    return ok({ tests }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminUser();
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return fail("VALIDATION_ERROR", "name is required", 400);
    const platform = String(body.platform ?? "all");
    const format = String(body.format ?? "all");
    const variants = (body.variants as Array<Record<string, unknown>>) ?? [];
    if (variants.length < 2 || variants.length > 4) {
      return fail("VALIDATION_ERROR", "Provide 2–4 variants", 400);
    }
    const total = sumAlloc(variants as { allocationPercent?: number }[]);
    if (Math.abs(total - 100) > 0.01) {
      return fail("VALIDATION_ERROR", "Variant allocation must sum to 100%", 400);
    }
    const minSamples = Math.max(20, Number(body.minSamplesPerVariant ?? 50));
    const significanceThreshold = Number(body.significanceThreshold ?? 0.05);
    const baselineRate = Math.min(0.99, Math.max(0.01, Number(body.baselineRate ?? 0.5)));
    const power = body.power != null ? Number(body.power) : 0.8;
    const mdeAbs = computeMinimumDetectableEffectAbsolute({
      minSamplesPerVariant: minSamples,
      baselineRate,
      significanceThreshold,
      power: Number.isFinite(power) ? power : 0.8,
    });
    const mdeRelative = mdeRelativeToBaseline(mdeAbs, baselineRate);

    const test = await prisma.promptABTest.create({
      data: {
        name,
        description: String(body.description ?? ""),
        platform,
        format,
        status: "draft",
        variants: variants as object[],
        minSamplesPerVariant: minSamples,
        significanceThreshold,
        autoPromoteWinner: Boolean(body.autoPromoteWinner),
        excludeNewUsers: body.excludeNewUsers !== false,
        holdbackPercent: Math.min(90, Math.max(0, Number(body.holdbackPercent ?? 0))),
        createdByUserId: userId,
        minimumDetectableEffect: mdeAbs,
      },
    });
    return ok(
      {
        test,
        mde: {
          absolute: mdeAbs,
          relativeToBaseline: mdeRelative,
          baselineRate,
          power: Number.isFinite(power) ? power : 0.8,
        },
      },
      201
    );
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
