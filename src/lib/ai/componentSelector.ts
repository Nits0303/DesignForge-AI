import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import type { ParsedIntent } from "@/types/ai";
import { SECTION_CATEGORIES } from "@/constants/sectionCategories";

const CACHE_SECONDS = 60 * 10;

export async function selectTemplatesForIntent(
  intent: ParsedIntent,
  opts?: { targetSection?: string }
): Promise<{ id: string; htmlSnippet: string; tags: string[] }[]> {
  const targetSection = opts?.targetSection;
  const key = `templates:intent:${intent.platform}:${intent.format}:${targetSection ?? ""}:${(intent.suggestedTemplateTags ?? [])
    .slice(0, 5)
    .join(",")}`;

  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const targetCategories = targetSection
    ? SECTION_CATEGORIES[targetSection] ?? [targetSection]
    : null;

  const templates = await prisma.template.findMany({
    where: {
      platform: intent.platform,
      isActive: true,
      ...(targetCategories ? { category: { in: targetCategories } } : {}),
    },
    take: 50,
  });

  const tags = (intent.suggestedTemplateTags ?? []).map((t) => t.toLowerCase());

  const scoredTemplates = templates
    .map((t) => {
      let score = 0;
      const templateTags = (t.tags ?? []).map((x) => x.toLowerCase());

      for (const tag of tags) {
        if (templateTags.includes(tag)) score += 3;
      }

      if (typeof t.avgApprovalRate === "number") {
        score += t.avgApprovalRate;
      }

      score += Math.min(5, Math.log((t.usageCount || 0) + 1));

      return { template: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const scored = scoredTemplates.map(({ template }) => ({
    id: template.id,
    htmlSnippet: template.htmlSnippet,
    tags: template.tags ?? [],
  }));

  await redis.set(key, JSON.stringify(scored), "EX", CACHE_SECONDS);

  // fire-and-forget usage increment
  setTimeout(async () => {
    try {
      await prisma.template.updateMany({
        where: { id: { in: scoredTemplates.map((x) => x.template.id) } },
        data: { usageCount: { increment: 1 } },
      });
    } catch (err) {
      console.error("Failed to increment template usageCount", err);
    }
  }, 0);

  return scored;
}


