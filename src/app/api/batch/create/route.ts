import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { resumeProcessingBatches } from "@/lib/batch/batchProcessor";
import { batchCreateInputSchema, createBatchJobForUser } from "@/lib/batch/createBatchJobForUser";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = batchCreateInputSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    void resumeProcessingBatches().catch(() => {});

    const { job, duplicateSkipped } = await createBatchJobForUser({
      userId: session.user.id,
      input: parsed.data,
    });

    return ok(
      {
        batchJob: job,
        validationSummary: null,
        duplicateSkipped,
        skippedCount: duplicateSkipped.length,
      },
      201
    );
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
