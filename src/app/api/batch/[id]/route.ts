import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().min(1),
});

function computeProgress(totalItems: number, completedItems: number) {
  const pct = totalItems <= 0 ? 0 : Math.round((completedItems / totalItems) * 1000) / 10;
  return clampTo0_100(pct);
}

function clampTo0_100(n: number) {
  return Math.max(0, Math.min(100, n));
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await context.params;
    const parsed = paramsSchema.safeParse({ id });
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid batch id", 400);

    const batchJob = await prisma.batchJob.findFirst({
      where: { id: parsed.data.id, userId: session.user.id },
    });
    if (!batchJob) return fail("NOT_FOUND", "Batch not found", 404);

    const items = await prisma.batchItem.findMany({
      where: { batchJobId: batchJob.id },
      orderBy: { itemIndex: "asc" },
      select: {
        id: true,
        itemIndex: true,
        topic: true,
        date: true,
        platform: true,
        format: true,
        status: true,
        designId: true,
        errorMessage: true,
        revisionPrompt: true,
        createdAt: true,
        design: {
          select: {
            id: true,
            title: true,
            assets: {
              where: { assetType: "preview" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { fileUrl: true },
            },
          },
        },
      },
    });

    const completedItems = items.filter((it) => it.status === "complete" || it.status === "approved").length;
    const currentlyProcessing = items.filter((it) => it.status === "generating").length;

    const progress = {
      percentComplete: computeProgress(batchJob.totalItems, completedItems),
      estimatedRemainingSeconds: null,
      currentlyProcessing,
    };

    return ok({
      batchJob,
      items: items.map((it) => ({
        id: it.id,
        itemIndex: it.itemIndex,
        topic: it.topic,
        date: it.date,
        platform: it.platform,
        format: it.format,
        status: it.status,
        designId: it.designId,
        errorMessage: it.errorMessage,
        design:
          it.status === "complete" || it.status === "approved"
            ? {
                previewUrl: it.design?.assets?.[0]?.fileUrl ?? null,
                title: it.design?.title ?? null,
              }
            : undefined,
      })),
      progress,
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

