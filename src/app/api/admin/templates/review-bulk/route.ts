import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { notifyContributorTemplateApproved } from "@/lib/notifications/marketplaceNotifications";
import { invalidateMarketplaceDetailCache, invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";

export const runtime = "nodejs";

const bodySchema = z.object({
  templateIds: z.array(z.string()).min(1).max(50),
  reviewNotes: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminUser();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const { templateIds, reviewNotes } = parsed.data;
    const now = new Date();

    const templates = await prisma.template.findMany({
      where: {
        id: { in: templateIds },
        submissionStatus: { in: ["submitted", "under_review"] },
        contributorUserId: { not: null },
      },
      select: { id: true, contributorUserId: true, name: true },
    });

    if (templates.length === 0) {
      return fail("NOT_FOUND", "No matching templates in queue", 404);
    }

    await prisma.$transaction(
      templates.map((t) =>
        prisma.template.update({
          where: { id: t.id },
          data: {
            submissionStatus: "approved",
            reviewedByUserId: userId,
            reviewedAt: now,
            reviewNotes: reviewNotes?.trim() ?? null,
            reviewingAdminUserId: null,
            reviewClaimedAt: null,
          } as any,
        })
      )
    );

    for (const t of templates) {
      if (t.contributorUserId) {
        await notifyContributorTemplateApproved({
          userId: t.contributorUserId,
          templateId: t.id,
          templateName: t.name,
          reviewNotes: reviewNotes?.trim() ?? null,
        });
      }
      await invalidateMarketplaceDetailCache(t.id);
    }
    await invalidateMarketplaceListCache();

    return ok({ approved: templates.map((t) => t.id) }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    console.error(e);
    return fail("INTERNAL_ERROR", "Bulk approve failed", 500);
  }
}
