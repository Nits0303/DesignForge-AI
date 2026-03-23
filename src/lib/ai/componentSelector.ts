import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import type { Prisma } from "@prisma/client";
import type { ParsedIntent } from "@/types/ai";
import { SECTION_CATEGORIES } from "@/constants/sectionCategories";
import type { Template } from "@prisma/client";

const CACHE_SECONDS = 60 * 10;

function contributorKey(t: Template): string {
  return t.contributorUserId ?? "__system__";
}

/** Pick up to `max` templates with at most `maxPerSource` sharing the same contributor (or system). */
function pickDiverseTop(
  scored: Array<{ template: Template; score: number }>,
  max: number,
  maxPerSource: number
): Template[] {
  const out: Template[] = [];
  const counts = new Map<string, number>();
  for (const row of scored) {
    const key = contributorKey(row.template);
    const n = counts.get(key) ?? 0;
    if (n >= maxPerSource) continue;
    counts.set(key, n + 1);
    out.push(row.template);
    if (out.length >= max) break;
  }
  if (out.length < max) {
    for (const row of scored) {
      if (out.some((t) => t.id === row.template.id)) continue;
      out.push(row.template);
      if (out.length >= max) break;
    }
  }
  return out.slice(0, max);
}

export async function selectTemplatesForIntent(
  intent: ParsedIntent,
  opts?: {
    userId?: string;
    targetSection?: string;
    templateSelectionStrategy?: "prefer_high_approval_rate" | "prefer_recency" | "prefer_diversity";
    /** For A/B: `prefer_high_approval` doubles approval weight (Sprint 16). */
    approvalRateMultiplier?: number;
  }
): Promise<{ id: string; htmlSnippet: string; tags: string[] }[]> {
  const targetSection = opts?.targetSection;
  const selectionStrategy = opts?.templateSelectionStrategy ?? "prefer_high_approval_rate";
  const approvalMult = opts?.approvalRateMultiplier ?? 1;
  const userId = opts?.userId;

  let installedIds: string[] = [];
  if (userId) {
    const rows = await prisma.templateInstallation.findMany({
      where: { userId, isActive: true },
      select: { templateId: true },
    });
    installedIds = rows.map((r) => r.templateId);
  }

  const key = `templates:intent:${intent.platform}:${intent.format}:${targetSection ?? ""}:${selectionStrategy}:${approvalMult}:${userId ?? "anon"}:${(intent.suggestedTemplateTags ?? [])
    .slice(0, 5)
    .join(",")}`;

  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const targetCategories = targetSection ? SECTION_CATEGORIES[targetSection] ?? [targetSection] : null;

  const formatStr = String(intent.format ?? "all");

  const sourceWhere: Prisma.TemplateWhereInput =
    installedIds.length > 0
      ? { OR: [{ contributorUserId: null }, { id: { in: installedIds } }] }
      : { contributorUserId: null };

  const andParts: Prisma.TemplateWhereInput[] = [
    { OR: [{ platform: intent.platform }, { platform: "all" }] },
    { OR: [{ format: formatStr }, { format: "all" }] },
    sourceWhere,
  ];
  if (targetCategories) {
    andParts.push({ category: { in: targetCategories } });
  }

  /* PERFORMANCE: template pick — uses platform + submissionStatus + optional installations. */
  const templates = await prisma.template.findMany({
    where: {
      isActive: true,
      submissionStatus: "approved",
      AND: andParts,
    },
    take: 80,
  });

  const tags = (intent.suggestedTemplateTags ?? []).map((t) => t.toLowerCase());

  const scoredTemplates = templates
    .map((t) => {
      let score = 0;
      const templateTags = (t.tags ?? []).map((x) => x.toLowerCase());

      for (const tag of tags) {
        if (templateTags.includes(tag)) score += 3;
      }

      if (intent.platform === "mobile") {
        const os = intent.appOS;
        if (os === "ios" && templateTags.includes("ios")) score += 2;
        if (os === "android" && templateTags.includes("android")) score += 2;
        const cat = intent.appCategory;
        if (cat && templateTags.includes(String(cat))) score += 2;
      }

      if (selectionStrategy === "prefer_high_approval_rate") {
        let approvalPart = 0;
        if (typeof t.avgApprovalRate === "number") approvalPart += t.avgApprovalRate;
        if (
          typeof t.avgMarketplaceRating === "number" &&
          (t.marketplaceRatingCount ?? 0) >= 5
        ) {
          approvalPart = approvalPart * 0.5 + (t.avgMarketplaceRating / 5) * 0.5;
        } else if (t.contributorUserId && typeof t.avgMarketplaceRating === "number") {
          approvalPart += (t.avgMarketplaceRating / 5) * 0.35;
        }
        score += approvalPart * approvalMult;
      } else if (selectionStrategy === "prefer_diversity") {
        const usage = t.usageCount ?? 0;
        score += 8 / Math.log(usage + 3);
        if (typeof t.avgApprovalRate === "number") score += t.avgApprovalRate * 0.35;
      } else {
        const ageDays = t.createdAt ? (Date.now() - t.createdAt.getTime()) / (24 * 60 * 60 * 1000) : 365;
        const recencyBonus = Math.max(0, 5 - ageDays / 30);
        score += recencyBonus;
        if (typeof t.avgApprovalRate === "number") score += t.avgApprovalRate * 0.25;
      }

      score += Math.min(5, Math.log((t.usageCount || 0) + 1));

      if (userId && installedIds.includes(t.id)) {
        score += 0.1;
      }

      return { template: t, score };
    })
    .sort((a, b) => b.score - a.score);

  const diverse = pickDiverseTop(scoredTemplates, 5, 2);

  const scored = diverse.map((template) => ({
    id: template.id,
    htmlSnippet: template.htmlSnippet,
    tags: template.tags ?? [],
  }));

  await redis.set(key, JSON.stringify(scored), "EX", CACHE_SECONDS);

  setTimeout(async () => {
    try {
      await prisma.template.updateMany({
        where: { id: { in: diverse.map((t) => t.id) } },
        data: { usageCount: { increment: 1 } },
      });
    } catch (err) {
      console.error("Failed to increment template usageCount", err);
    }
  }, 0);

  return scored;
}
