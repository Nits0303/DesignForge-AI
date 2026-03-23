import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getAnalyticsOrCompute } from "@/lib/analytics/cache";
import { AnalyticsTimeoutError } from "@/lib/analytics/timeout";
import { getAdminPromptScores } from "@/lib/analytics/admin/promptScores";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

const querySchema = z.object({
  platform: z.string().optional(),
  format: z.string().optional(),
  minUses: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdminUser();
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      platform: url.searchParams.get("platform") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
      minUses: url.searchParams.get("minUses") ?? undefined,
    });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query", 400);

    const { platform, format, minUses = 0 } = parsed.data;
    const cacheKey = `analytics:admin:prompt-scores:${platform ?? "all"}:${format ?? "all"}:${minUses}`;

    const res = await getAnalyticsOrCompute({
      key: cacheKey,
      compute: () => getAdminPromptScores({ platform, format, minUses }),
    });

    return ok(res.data, 200);
  } catch (err: any) {
    if (err instanceof AnalyticsTimeoutError || err?.code === "ANALYTICS_TIMEOUT") {
      return fail("ANALYTICS_TIMEOUT", "Analytics are taking longer than usual. Please try again in a moment.", 504);
    }
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

