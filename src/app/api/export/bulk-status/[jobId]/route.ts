import { z } from "zod";
import { redis } from "@/lib/redis/client";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const paramsSchema = z.object({ jobId: z.string().min(1) });

export async function GET(_req: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const session = await getRequiredSession();
    const { jobId } = await context.params;
    const parsed = paramsSchema.safeParse({ jobId });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid job id", 400);

    const key = `bulk_export:${parsed.data.jobId}`;
    const cached = await redis.get(key);
    if (!cached) return ok({ status: "pending", processed: 0, total: 0, currentDesignTitle: "", zipUrl: null });

    const json = JSON.parse(cached);
    return ok({ ...json });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

