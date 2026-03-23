import { fail, ok } from "@/lib/api/response";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import {
  computeMinimumDetectableEffectAbsolute,
  mdeRelativeToBaseline,
} from "@/lib/learning/abTestMde";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdminUser();
    const { searchParams } = new URL(req.url);
    const n = Math.max(1, Number(searchParams.get("n") ?? 50));
    const baselineRate = Math.min(0.99, Math.max(0.01, Number(searchParams.get("baseline") ?? 0.5)));
    const alpha = Math.min(0.5, Math.max(0.001, Number(searchParams.get("alpha") ?? 0.05)));
    const power = Math.min(0.999, Math.max(0.5, Number(searchParams.get("power") ?? 0.8)));
    const absolute = computeMinimumDetectableEffectAbsolute({
      minSamplesPerVariant: n,
      baselineRate,
      significanceThreshold: alpha,
      power,
    });
    return ok(
      {
        minSamplesPerVariant: n,
        baselineRate,
        significanceThreshold: alpha,
        power,
        absoluteMde: absolute,
        relativeMde: mdeRelativeToBaseline(absolute, baselineRate),
        absoluteMdePercent: absolute * 100,
      },
      200
    );
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
