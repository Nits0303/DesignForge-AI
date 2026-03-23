import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { runContributionAutoChecks } from "@/lib/marketplace/contributionChecks";
import { notifyAdminsTemplateSubmitted } from "@/lib/notifications/marketplaceNotifications";
import { invalidateMarketplaceDetailCache, invalidateMarketplaceListCache } from "@/lib/marketplace/marketplaceCache";
import { runSubmissionPipeline } from "@/lib/marketplace/contributionSubmissionPipeline";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().min(5).max(80),
  htmlSnippet: z.string().min(1),
  marketplaceDescription: z.string().max(500).optional().nullable(),
  category: z.string().min(1),
  platform: z.string().min(1),
  format: z.string().default("all"),
  tags: z.array(z.string()).max(10).default([]),
  licenseType: z.enum(["mit", "cc_by", "cc_by_nc", "proprietary"]).default("mit"),
  submissionNotes: z.string().optional().nullable(),
  previewImages: z.array(z.string()).max(4).optional().nullable(),
  previewUrl: z.string().optional().nullable(),
  submissionStatus: z.enum(["draft", "submitted"]),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await ctx.params;
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.flatten().toString(), 400);
    }
    const b = parsed.data;
    const userId = session.user.id;

    const existing = await prisma.template.findFirst({
      where: { id, contributorUserId: userId },
    });
    if (!existing) return fail("NOT_FOUND", "Template not found", 404);

    // Approved template: only allow re-submission of a new revision for review (not draft).
    if (existing.submissionStatus === "approved") {
      if (b.submissionStatus !== "submitted") {
        return fail("FORBIDDEN", "Approved templates can only be updated by submitting a new revision", 403);
      }
      const checks = runContributionAutoChecks(b.htmlSnippet);
      if (!checks.ok) return fail("POLICY_VIOLATION", checks.reason, 400);
      const pipeline = await runSubmissionPipeline({
        html: b.htmlSnippet,
        platform: b.platform,
        category: b.category,
        excludeTemplateId: id,
      });
      const nextVersion = bumpSemver(existing.templateVersion);
      const updated = await prisma.template.update({
        where: { id },
        data: {
          name: b.name,
          htmlSnippet: b.htmlSnippet,
          marketplaceDescription: b.marketplaceDescription ?? null,
          category: b.category,
          platform: b.platform,
          format: b.format,
          tags: b.tags,
          licenseType: b.licenseType,
          submissionNotes: b.submissionNotes ?? null,
          previewImages: (b.previewImages as any) ?? undefined,
          previewUrl: b.previewUrl ?? undefined,
          templateVersion: nextVersion,
          submissionStatus: "submitted",
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNotes: null,
          externalImageFlagged: checks.flags.externalImages,
          similarityFlagged: pipeline.similarityFlagged,
          similarToTemplateId: pipeline.similarToTemplateId,
          renderCheckFailed: pipeline.renderCheckFailed,
          reviewingAdminUserId: null,
          reviewClaimedAt: null,
        } as any,
      });
      const contributor = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      await notifyAdminsTemplateSubmitted({
        templateId: updated.id,
        templateName: updated.name,
        contributorName: contributor?.name ?? contributor?.email ?? "Contributor",
        contributorId: userId,
      });
      await invalidateMarketplaceDetailCache(id);
      await invalidateMarketplaceListCache();
      return ok({ template: updated }, 200);
    }

    if (existing.submissionStatus === "submitted") {
      return fail("FORBIDDEN", "This submission is waiting in the review queue and cannot be edited", 403);
    }

    if (!["draft", "rejected", "under_review"].includes(existing.submissionStatus)) {
      return fail("FORBIDDEN", "This template cannot be edited", 403);
    }

    if (b.submissionStatus === "submitted") {
      const rl = await checkRateLimit(`template_submit:${userId}`, {
        windowSeconds: 60 * 60 * 24,
        maxRequests: 10,
      });
      if (!rl.allowed) {
        return fail(
          "RATE_LIMITED",
          "You've reached the daily submission limit. Please try again tomorrow.",
          429
        );
      }
    }

    const checks = runContributionAutoChecks(b.htmlSnippet);
    if (b.submissionStatus === "submitted" && !checks.ok) {
      return fail("POLICY_VIOLATION", checks.reason, 400);
    }

    const pipeline =
      b.submissionStatus === "submitted"
        ? await runSubmissionPipeline({
            html: b.htmlSnippet,
            platform: b.platform,
            category: b.category,
            excludeTemplateId: id,
          })
        : null;

    const updated = await prisma.template.update({
      where: { id },
      data: {
        name: b.name,
        htmlSnippet: b.htmlSnippet,
        marketplaceDescription: b.marketplaceDescription ?? null,
        category: b.category,
        platform: b.platform,
        format: b.format,
        tags: b.tags,
        licenseType: b.licenseType,
        submissionNotes: b.submissionNotes ?? null,
        previewImages: (b.previewImages as any) ?? undefined,
        previewUrl: b.previewUrl ?? undefined,
        submissionStatus: b.submissionStatus === "submitted" ? "submitted" : "draft",
        externalImageFlagged:
          b.submissionStatus === "submitted" && checks.ok
            ? checks.flags.externalImages
            : existing.externalImageFlagged,
        ...(pipeline
          ? {
              similarityFlagged: pipeline.similarityFlagged,
              similarToTemplateId: pipeline.similarToTemplateId,
              renderCheckFailed: pipeline.renderCheckFailed,
            }
          : {}),
        ...(b.submissionStatus === "submitted"
          ? { reviewingAdminUserId: null, reviewClaimedAt: null }
          : {}),
      } as any,
    });

    if (b.submissionStatus === "submitted") {
      const contributor = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      await notifyAdminsTemplateSubmitted({
        templateId: updated.id,
        templateName: updated.name,
        contributorName: contributor?.name ?? contributor?.email ?? "Contributor",
        contributorId: userId,
      });
      await invalidateMarketplaceListCache();
    }
    await invalidateMarketplaceDetailCache(id);
    return ok({ template: updated }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Update failed", 500);
  }
}

function bumpSemver(v: string): string {
  const parts = v.split(".").map((x) => parseInt(x, 10));
  if (parts.length >= 2 && !parts.some((n) => Number.isNaN(n))) {
    parts[1] = (parts[1] ?? 0) + 1;
    return parts.slice(0, 3).join(".");
  }
  return "1.1";
}
