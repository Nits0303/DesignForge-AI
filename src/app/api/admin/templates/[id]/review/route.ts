import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import {
  notifyContributorReviewChanges,
  notifyContributorTemplateApproved,
  notifyContributorTemplateRejected,
} from "@/lib/notifications/marketplaceNotifications";
import { invalidateMarketplaceDetailCache, invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";

export const runtime = "nodejs";

const bodySchema = z.object({
  decision: z.enum(["approved", "request_changes", "rejected"]),
  reviewNotes: z.string().optional().nullable(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminUser();
    const { id } = await ctx.params;
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const { decision, reviewNotes } = parsed.data;

    const tpl = await prisma.template.findFirst({
      where: {
        id,
        submissionStatus: { in: ["submitted", "under_review"] },
      },
      include: { contributor: { select: { id: true, name: true, email: true } } },
    });
    if (!tpl) return fail("NOT_FOUND", "Template not awaiting review", 404);
    if (!tpl.contributorUserId) {
      return fail("VALIDATION_ERROR", "System templates are not reviewed here", 400);
    }

    if (decision === "rejected" && !reviewNotes?.trim()) {
      return fail("VALIDATION_ERROR", "Review notes are required when rejecting", 400);
    }

    const now = new Date();

    if (decision === "approved") {
      const updated = await prisma.template.update({
        where: { id },
        data: {
          submissionStatus: "approved",
          reviewedByUserId: userId,
          reviewedAt: now,
          reviewNotes: reviewNotes?.trim() ?? null,
          reviewingAdminUserId: null,
          reviewClaimedAt: null,
        } as any,
      });
      await notifyContributorTemplateApproved({
        userId: tpl.contributorUserId,
        templateId: id,
        templateName: tpl.name,
        reviewNotes: reviewNotes?.trim() ?? null,
      });
      await invalidateMarketplaceDetailCache(id);
      await invalidateMarketplaceListCache();
      return ok({ template: updated }, 200);
    }

    if (decision === "request_changes") {
      const updated = await prisma.template.update({
        where: { id },
        data: {
          submissionStatus: "under_review",
          reviewNotes: reviewNotes?.trim() ?? "",
          reviewedByUserId: userId,
          reviewedAt: now,
          reviewingAdminUserId: userId,
        },
      });
      await notifyContributorReviewChanges({
        userId: tpl.contributorUserId,
        templateId: id,
        templateName: tpl.name,
        reviewNotes: reviewNotes?.trim() ?? "Please see reviewer feedback.",
      });
      await invalidateMarketplaceDetailCache(id);
      return ok({ template: updated }, 200);
    }

    // rejected
    const updated = await prisma.template.update({
      where: { id },
      data: {
        submissionStatus: "rejected",
        reviewedByUserId: userId,
        reviewedAt: now,
        reviewNotes: reviewNotes!.trim(),
        reviewingAdminUserId: null,
        reviewClaimedAt: null,
      } as any,
    });
    await notifyContributorTemplateRejected({
      userId: tpl.contributorUserId,
      templateId: id,
      templateName: tpl.name,
      reviewNotes: reviewNotes!.trim(),
    });
    await invalidateMarketplaceDetailCache(id);
    return ok({ template: updated }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    console.error(e);
    return fail("INTERNAL_ERROR", "Review failed", 500);
  }
}
