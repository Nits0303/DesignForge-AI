/**
 * Bag-of-words similarity over Tailwind class tokens in HTML (Sprint 17).
 */

import { prisma } from "@/lib/db/prisma";

function extractClassFrequency(html: string): Map<string, number> {
  const freq = new Map<string, number>();
  const re = /class\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    for (const c of m[1].split(/\s+/)) {
      const t = c.trim();
      if (t.length < 2) continue;
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb) dot += va * vb;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type SimilarityMatch = {
  score: number;
  templateId: string;
  templateName: string;
};

/**
 * Compare HTML to existing approved templates (same platform + category).
 * Returns best match if score >= threshold (default 0.8).
 */
export async function findSimilarTemplate(args: {
  html: string;
  platform: string;
  category: string;
  excludeTemplateId?: string;
  threshold?: number;
}): Promise<SimilarityMatch | null> {
  const threshold = args.threshold ?? 0.8;
  const rows = await prisma.template.findMany({
    where: {
      submissionStatus: "approved",
      isActive: true,
      platform: args.platform,
      category: args.category,
      ...(args.excludeTemplateId ? { id: { not: args.excludeTemplateId } } : {}),
    },
    select: { id: true, name: true, htmlSnippet: true },
    take: 250,
  });

  const target = extractClassFrequency(args.html);
  if (target.size === 0) return null;

  let best: SimilarityMatch | null = null;
  for (const row of rows) {
    const other = extractClassFrequency(row.htmlSnippet ?? "");
    if (other.size === 0) continue;
    const score = cosineSimilarity(target, other);
    if (score >= threshold && (!best || score > best.score)) {
      best = { score, templateId: row.id, templateName: row.name };
    }
  }
  return best;
}
