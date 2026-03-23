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
  id: z.string().optional(),
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

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.flatten().toString(), 400);
    }
    const b = parsed.data;
    const userId = session.user.id;

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

      const checks = runContributionAutoChecks(b.htmlSnippet);
      if (!checks.ok) {
        return fail("POLICY_VIOLATION", checks.reason, 400);
      }

      const contributor = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      const contributorName = contributor?.name ?? contributor?.email ?? "A contributor";

      const pipeline = await runSubmissionPipeline({
        html: b.htmlSnippet,
        platform: b.platform,
        category: b.category,
        excludeTemplateId: b.id,
      });

      if (b.id) {
        const existing = await prisma.template.findFirst({
          where: { id: b.id, contributorUserId: userId },
        });
        if (!existing) return fail("NOT_FOUND", "Draft not found", 404);
        if (!["draft", "rejected", "under_review"].includes(existing.submissionStatus)) {
          return fail("FORBIDDEN", "This template cannot be updated right now", 403);
        }

        const updated = await prisma.template.update({
          where: { id: b.id },
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
            submissionStatus: "submitted",
            externalImageFlagged: checks.flags.externalImages,
            similarityFlagged: pipeline.similarityFlagged,
            similarToTemplateId: pipeline.similarToTemplateId,
            renderCheckFailed: pipeline.renderCheckFailed,
            reviewingAdminUserId: null,
            reviewClaimedAt: null,
          } as any,
        });

        await notifyAdminsTemplateSubmitted({
          templateId: updated.id,
          templateName: updated.name,
          contributorName,
          contributorId: userId,
        });
        await invalidateMarketplaceDetailCache(updated.id);
        await invalidateMarketplaceListCache();
        return ok({ template: updated }, 200);
      }

      const created = await prisma.template.create({
        data: {
          name: b.name,
          tier: "section",
          category: b.category,
          platform: b.platform,
          format: b.format,
          htmlSnippet: b.htmlSnippet,
          tags: b.tags,
          source: "community",
          contributorUserId: userId,
          submissionStatus: "submitted",
          submissionNotes: b.submissionNotes ?? null,
          marketplaceDescription: b.marketplaceDescription ?? null,
          previewImages: (b.previewImages as any) ?? undefined,
          previewUrl: b.previewUrl ?? undefined,
          licenseType: b.licenseType,
          externalImageFlagged: checks.flags.externalImages,
          similarityFlagged: pipeline.similarityFlagged,
          similarToTemplateId: pipeline.similarToTemplateId,
          renderCheckFailed: pipeline.renderCheckFailed,
        },
      });

      await notifyAdminsTemplateSubmitted({
        templateId: created.id,
        templateName: created.name,
        contributorName,
        contributorId: userId,
      });
      await invalidateMarketplaceListCache();
      return ok({ template: created }, 201);
    }

    // draft
    if (b.id) {
      const existing = await prisma.template.findFirst({
        where: { id: b.id, contributorUserId: userId },
      });
      if (!existing) return fail("NOT_FOUND", "Draft not found", 404);
      if (!["draft", "rejected", "under_review"].includes(existing.submissionStatus)) {
        return fail("FORBIDDEN", "Cannot edit this template as a draft", 403);
      }
      const updated = await prisma.template.update({
        where: { id: b.id },
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
          submissionStatus: "draft",
        },
      });
      await invalidateMarketplaceDetailCache(updated.id);
      return ok({ template: updated }, 200);
    }

    const created = await prisma.template.create({
      data: {
        name: b.name,
        tier: "section",
        category: b.category,
        platform: b.platform,
        format: b.format,
        htmlSnippet: b.htmlSnippet,
        tags: b.tags,
        source: "community",
        contributorUserId: userId,
        submissionStatus: "draft",
        submissionNotes: b.submissionNotes ?? null,
        marketplaceDescription: b.marketplaceDescription ?? null,
        previewImages: (b.previewImages as any) ?? undefined,
        previewUrl: b.previewUrl ?? undefined,
        licenseType: b.licenseType,
      },
    });
    return ok({ template: created }, 201);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Contribute failed", 500);
  }
}
