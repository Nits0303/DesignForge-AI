import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed", "partial", "cancelled"]).optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getRequiredSession();
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid query params", 400);

    const { status, page = 1, limit = 20 } = parsed.data;
    const where: any = { userId: session.user.id };
    if (status) where.status = status;

    const [total, jobs] = await Promise.all([
      prisma.batchJob.count({ where }),
      prisma.batchJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          totalItems: true,
          completedItems: true,
          failedItems: true,
          estimatedCostUsd: true,
          actualCostUsd: true,
          processingStrategy: true,
          createdAt: true,
        },
      }),
    ]);

    return ok({ jobs, total, page, limit });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

