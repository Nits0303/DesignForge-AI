import { parse } from "node-html-parser";
import type { ParsedIntent } from "@/types/ai";
import { assembleRevisionPrompt } from "@/lib/ai/revisionPromptAssembler";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { PROMPTS } from "@/lib/ai/prompts";
import { prisma } from "@/lib/db/prisma";
import { AI_MODELS } from "@/constants/models";

function normalizeSectionToken(s: string) {
  return s.toLowerCase().replace(/[_-]/g, " ").trim();
}

export function extractSectionTypesFromHtml(html: string): string[] {
  try {
    const root = parse(html);
    const els = root.querySelectorAll("section[data-section-type]");
    const uniq = new Set<string>();
    for (const el of els) {
      const t = el.getAttribute("data-section-type");
      if (t) uniq.add(t);
    }
    return [...uniq];
  } catch {
    return [];
  }
}

export function detectTargetSectionType(revisionText: string, sectionTypes: string[]): string | null {
  const t = normalizeSectionToken(revisionText);
  for (const s of sectionTypes) {
    const sn = normalizeSectionToken(s);
    if (!sn) continue;
    if (t.includes(sn)) return s;
  }
  for (const s of sectionTypes) {
    const first = normalizeSectionToken(s).split(" ")[0];
    if (!first) continue;
    if (t.includes(first)) return s;
  }
  return null;
}

export function extractSectionOuterHtml(html: string, sectionType: string): string | null {
  try {
    const root = parse(html);
    const el = root.querySelector(`section[data-section-type="${sectionType}"]`);
    if (!el) return null;
    return el.toString();
  } catch {
    return null;
  }
}

export function ensureSectionWrapped(sectionType: string, htmlSnippet: string) {
  const trimmed = (htmlSnippet ?? "").trim();
  if (!trimmed) return `<section data-section-type="${sectionType}" class="py-20"></section>`;
  const hasSection = /<section\b/i.test(trimmed);
  if (hasSection) {
    // If it's already wrapped, keep it (or best-effort inject the correct attribute).
    if (trimmed.includes(`data-section-type="${sectionType}"`)) return trimmed;
    return trimmed.replace(/<section\b([^>]*)>/i, `<section $1 data-section-type="${sectionType}">`);
  }
  return `<section data-section-type="${sectionType}">${trimmed}</section>`;
}

export function replaceSectionOuterHtml(fullHtml: string, oldOuter: string, newOuter: string): string {
  if (oldOuter && fullHtml.includes(oldOuter)) {
    return fullHtml.replace(oldOuter, newOuter);
  }
  // Fallback: best-effort swap by sectionType marker.
  return fullHtml;
}

export async function reviseSectionTargeted({
  userId,
  designId,
  currentHtml,
  revisionText,
  targetSectionType,
  slideIndex,
  referenceImageUrl,
}: {
  userId: string;
  designId: string;
  currentHtml: string;
  revisionText: string;
  targetSectionType: string;
  slideIndex?: number | null;
  referenceImageUrl?: string | null;
}): Promise<{ revisedHtml: string; model: string; pattern: any }> {
  const oldOuter = extractSectionOuterHtml(currentHtml, targetSectionType);
  if (!oldOuter) {
    return { revisedHtml: currentHtml, model: "—", pattern: { type: "other" } };
  }

  const design = await prisma.design.findUnique({
    where: { id: designId },
    include: { brand: true },
  });

  if (!design) return { revisedHtml: currentHtml, model: "—", pattern: { type: "other" } };

  const intent: ParsedIntent = (design.parsedIntent ?? { platform: design.platform, format: design.format }) as any;

  const revisedSectionInstruction = `${revisionText}\n\nIMPORTANT: Only revise the HTML inside the targeted section (data-section-type="${targetSectionType}"). Preserve the wrapper tag and its data-section-type.`;

  const { system, messages, pattern } = await assembleRevisionPrompt({
    userId,
    designId,
    currentHtml: oldOuter,
    revisionText: revisedSectionInstruction,
    slideIndex,
    slideLabel: "slide",
    referenceImageUrl,
  });

  const res = await callAnthropicWithRetry(
    {
      model: AI_MODELS.GENERATOR_SONNET as any,
      system,
      max_tokens: 2048,
      messages,
      metadata: {
        cache_control: { type: "ephemeral" },
        system_version: PROMPTS.revision?.version ?? "revision-v1",
      } as any,
    },
    { userId, designId }
  );

  const revisedSnippet = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
  const newOuter = ensureSectionWrapped(targetSectionType, revisedSnippet);
  const combined = replaceSectionOuterHtml(currentHtml, oldOuter, newOuter);

  const processed = await postProcessHtml({
    html: combined.trim(),
    intent,
    brand: {
      name: design.brand?.name ?? "brand",
      typography: (design.brand?.typography as any) ?? [],
      colors: (design.brand?.colors as any) ?? {},
    } as any,
  });

  return { revisedHtml: processed.html, model: "sonnet", pattern };
}

