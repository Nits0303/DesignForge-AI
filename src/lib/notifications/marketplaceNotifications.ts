import { prisma } from "@/lib/db/prisma";
import { userWantsMarketplaceNotification } from "@/lib/marketplace/marketplacePrefs";

export async function notifyAdminsTemplateSubmitted(args: {
  templateId: string;
  templateName: string;
  contributorName: string;
  contributorId: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "template_review_requested",
      title: "New template submitted",
      body: `${args.contributorName} submitted “${args.templateName.slice(0, 80)}” for review.`,
      actionUrl: `/admin/templates/review/${args.templateId}`,
      metadata: {
        templateId: args.templateId,
        contributorId: args.contributorId,
      } as any,
    })),
  });
}

export async function notifyContributorTemplateApproved(args: {
  userId: string;
  templateId: string;
  templateName: string;
  reviewNotes?: string | null;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: "template_approved",
      title: "Template approved",
      body:
        args.reviewNotes?.trim() ??
        `Your template “${args.templateName.slice(0, 80)}” is live in the marketplace.`,
      actionUrl: `/templates/${args.templateId}`,
      metadata: { templateId: args.templateId } as any,
    },
  });
}

export async function notifyContributorTemplateRejected(args: {
  userId: string;
  templateId: string;
  templateName: string;
  reviewNotes: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: "template_rejected",
      title: "Template needs changes",
      body: `“${args.templateName.slice(0, 60)}”: ${args.reviewNotes.slice(0, 400)}`,
      actionUrl: `/templates/contribute?resume=${args.templateId}`,
      metadata: { templateId: args.templateId } as any,
    },
  });
}

export async function notifyContributorReviewChanges(args: {
  userId: string;
  templateId: string;
  templateName: string;
  reviewNotes: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: "template_changes_requested",
      title: "Reviewer requested changes",
      body: `“${args.templateName.slice(0, 60)}”: ${args.reviewNotes.slice(0, 400)}`,
      actionUrl: `/templates/contribute?resume=${args.templateId}`,
      metadata: { templateId: args.templateId } as any,
    },
  });
}

export async function notifyAdminsTemplateReported(args: {
  templateId: string;
  templateName: string;
  reporterName: string;
  reportType: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "template_reported",
      title: "Template reported",
      body: `${args.reporterName} reported “${args.templateName.slice(0, 60)}” (${args.reportType}).`,
      actionUrl: `/admin/templates/review/${args.templateId}`,
      metadata: { templateId: args.templateId } as any,
    })),
  });
}

/** Daily batched digest: one notification per contributor summarizing installs. */
export async function notifyContributorInstallDigest(args: {
  contributorUserId: string;
  lines: string[];
  totalInstalls: number;
}): Promise<void> {
  if (args.lines.length === 0) return;
  const ok = await userWantsMarketplaceNotification(args.contributorUserId, "notify_template_installed");
  if (!ok) return;

  await prisma.notification.create({
    data: {
      userId: args.contributorUserId,
      type: "template_installed",
      title: "Your templates were installed",
      body: `${args.totalInstalls} new install(s): ${args.lines.join("; ").slice(0, 450)}`,
      actionUrl: `/templates/my-library?tab=contributions`,
      metadata: { digest: true } as any,
    },
  });
}
