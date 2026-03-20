import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { analyzeReferenceImage } from "@/lib/ai/referenceAnalyzer";

export const runtime = "nodejs";

const bodySchema = z.object({
  referenceId: z.string().cuid(),
  forceFresh: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const analysis = await analyzeReferenceImage({
      referenceId: parsed.data.referenceId,
      userId: session.user.id,
      forceFresh: parsed.data.forceFresh ?? false,
    });
    if (!analysis) {
      return ok({
        analysis: null,
        warning:
          "We couldn't extract design patterns from this image. It may not contain a recognizable UI design.",
      });
    }
    return ok(analysis);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "Failed to analyze reference", 500);
  }
}

