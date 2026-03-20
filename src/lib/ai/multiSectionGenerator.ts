import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import { PROMPTS } from "@/lib/ai/prompts";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { selectTemplatesForIntent } from "@/lib/ai/componentSelector";
import { brandProfileToXml } from "@/lib/ai/brandSerializer";
import { DEFAULT_SECTION_PLANS } from "@/constants/sectionDefaults";
import { buildDependencyBatches } from "@/constants/sectionDependencies";
import { wrapWithDashboardBrowserChrome } from "@/lib/preview/browserChrome";

import type { ParsedIntent } from "@/types/ai";
import { AI_MODELS, AI_PRICING } from "@/constants/models";

type MultiSectionCallbacks = {
  onSectionStart?: (payload: {
    sectionType: string;
    sectionIndex: number;
    totalSections: number;
  }) => void | Promise<void>;
  onSectionComplete?: (payload: {
    sectionType: string;
    sectionIndex: number;
    sectionHtml: string;
    assembledHtml: string;
  }) => void | Promise<void>;
};

function computeUsageCostUsd(model: string, usage: any): number {
  const pricing = model === AI_MODELS.ROUTER_HAIKU ? AI_PRICING.HAIKU : AI_PRICING.SONNET;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const costInput =
    (inputTokens / 1_000_000) * pricing.inputPerMTokens +
    (cacheWrite / 1_000_000) * pricing.inputPerMTokens +
    (cacheRead / 1_000_000) * pricing.inputPerMTokens * AI_PRICING.CACHE_READ_DISCOUNT;
  const costOutput = (outputTokens / 1_000_000) * pricing.outputPerMTokens;
  return Number((costInput + costOutput).toFixed(6));
}

function defaultSectionPlanForWebsite(intent: ParsedIntent): string[] {
  const f = String(intent.format ?? "").toLowerCase();
  switch (f) {
    case "landing_page":
      return ["navbar", "hero", "social_proof", "features", "testimonials", "pricing", "faq", "footer"];
    case "hero_section":
      return ["navbar", "hero", "footer"];
    case "features_section":
      return ["navbar", "features", "footer"];
    case "pricing_section":
      return ["navbar", "pricing", "footer"];
    case "about_page":
      return ["navbar", "about", "footer"];
    case "contact_page":
      return ["navbar", "contact", "footer"];
    case "blog_page":
      return ["navbar", "blog", "footer"];
    case "coming_soon":
      return ["navbar", "hero", "footer"];
    default:
      return ["navbar", "hero", "social_proof", "features", "pricing", "footer"];
  }
}

function defaultSectionPlanForDashboard(intent: ParsedIntent): string[] {
  const f = String(intent.format ?? "").toLowerCase();
  switch (f) {
    case "analytics_dashboard":
      return ["sidebar_nav", "top_bar", "kpi_row", "chart_primary", "chart_secondary", "data_table", "activity_feed"];
    case "admin_panel":
      return ["sidebar_nav", "top_bar", "action_bar", "data_table", "pagination"];
    case "settings_page":
      return ["sidebar_nav", "top_bar", "settings_sections"];
    case "user_management":
      return ["sidebar_nav", "top_bar", "filter_bar", "user_table", "pagination"];
    default:
      return ["sidebar_nav", "top_bar", "data_table", "footer"];
  }
}

function ensureWrappedSection(sectionType: string, maybeHtml: string): string {
  const html = (maybeHtml ?? "").trim();
  if (!html) {
    return `<section data-section-type="${sectionType}" class="py-20">
  <div class="text-center text-sm text-[hsl(var(--muted-foreground))]">${sectionType}</div>
</section>`;
  }
  // If it's already wrapped, keep it; otherwise wrap.
  const hasSection = /<section\b[^>]*>/i.test(html);
  if (hasSection && html.includes(`data-section-type="${sectionType}"`)) return html;
  if (hasSection) {
    return html.replace(/<section\b([^>]*)>/i, `<section $1 data-section-type="${sectionType}">`);
  }
  return `<section data-section-type="${sectionType}" class="py-20">${html}</section>`;
}

export async function generateMultiSectionHtml({
  userId,
  brandId,
  intent,
  userPrompt,
  referenceImageUrl,
  model,
  maxTokens,
  strategy = "quality",
}: {
  userId: string;
  brandId: string;
  intent: ParsedIntent;
  userPrompt: string;
  referenceImageUrl?: string;
  model: string;
  maxTokens: number;
  strategy?: "fast" | "quality";
}, cb: MultiSectionCallbacks = {}): Promise<{
  finalHtml: string;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  generationTimeMs: number;
  sectionCount: number;
  parallelBatches: number;
  sectionFailures: Record<string, number>;
}> {
  const startedAt = Date.now();

  const brand = await prisma.brandProfile.findFirst({ where: { id: brandId, userId } });
  if (!brand) throw new Error("Brand not found");

  const sectionPlan =
    Array.isArray(intent.sectionPlan) && intent.sectionPlan.length
      ? intent.sectionPlan
      : intent.platform === "website"
        ? DEFAULT_SECTION_PLANS.website[String(intent.format).toLowerCase()] ?? defaultSectionPlanForWebsite(intent)
        : DEFAULT_SECTION_PLANS.dashboard[String(intent.format).toLowerCase()] ?? defaultSectionPlanForDashboard(intent);

  const sections: string[] = [];
  const sectionCount = sectionPlan.length;

  let totalTokens = 0;
  let cachedTokens = 0;
  let costUsd = 0;
  let parallelBatches = 0;
  const sectionFailures: Record<string, number> = {};

  const brandXml = brandProfileToXml(brand as any);

  const passPlan =
    strategy === "fast"
      ? [
          { name: "fast", passModel: AI_MODELS.ROUTER_HAIKU as any, passMaxTokens: Math.max(600, Math.floor(maxTokens * 0.55)) },
          { name: "quality", passModel: model as any, passMaxTokens: maxTokens },
        ]
      : [{ name: "quality", passModel: model as any, passMaxTokens: maxTokens }];

  // Pre-fill sections with placeholders so assembly keeps order while parallel sections are still running.
  for (let i = 0; i < sectionPlan.length; i++) {
    sections.push(ensureWrappedSection(sectionPlan[i]!, ""));
  }

  async function renderAssembled() {
    const assembledBody =
      intent.platform === "dashboard" ? wrapWithDashboardBrowserChrome(sections.join("\n")) : sections.join("\n");
    const raw = `<!DOCTYPE html><html><head></head><body>${assembledBody}</body></html>`;
    const processed = await postProcessHtml({
      html: raw,
      intent,
      brand: { name: brand!.name, typography: brand!.typography as any, colors: brand!.colors as any },
    });
    return processed.html;
  }

  async function generateOneSection(sectionType: string, sectionIndex: number, passName: string, passModel: string, passMaxTokens: number) {
    const cacheKey = `sec:${passName}:${intent.platform}:${intent.format}:${brandId}:${sectionType}:${(intent.styleContext ?? []).slice(0, 5).join(",")}`;
    const cached = await redis.get(cacheKey);
    let sectionHtml = "";
    let sectionUsage: any = null;

    if (cached) {
      sectionHtml = cached;
    } else {
      const sectionTemplates = await selectTemplatesForIntent(intent, { targetSection: sectionType });

      const componentLines = passName === "fast"
        ? sectionTemplates
            .slice(0, 2)
            .map((t, idx) => `<!-- component ${idx + 1} -->\n${t.htmlSnippet.trim()}`)
            .join("\n\n")
        : sectionTemplates
            .slice(0, 3)
            .map(
              (t, idx) =>
                `<!-- component ${idx + 1} tags: ${t.tags.join(", ")} -->\n${t.htmlSnippet.trim()}`
            )
            .join("\n\n");

      const system = `${PROMPTS.generation.system}\n\nIMPORTANT:\n- Generate ONLY the section specified by SECTION TYPE: ${sectionType}.\n- Output MUST be a single HTML snippet for that section.\n- Wrap the section in: <section data-section-type="${sectionType}">...</section>\n- Do not output <html>, <head>, or <body>.\n- Keep vertical spacing consistent.\n`;

      const userContentParts: string[] = [];
      userContentParts.push(
        `PAGE CONTEXT:\n${JSON.stringify(
          {
            platform: intent.platform,
            format: intent.format,
            sectionType,
            designMood: intent.designMood,
            colorPreference: intent.colorPreference,
            complexity: intent.complexity,
            industryStyle: intent.styleContext,
          },
          null,
          2
        )}`
      );
      userContentParts.push(`USER PROMPT:\n${userPrompt}`);
      if (referenceImageUrl) {
        userContentParts.push(
          "REFERENCE IMAGE NOTE:\nThe user uploaded a reference image for style inspiration. Preserve mood/color/layout density while applying the brand profile's colors/fonts."
        );
      }
      if (componentLines) userContentParts.push(`COMPONENT LIBRARY:\n${componentLines}`);

      const sectionPrompt = userContentParts.join("\n\n---\n\n");
      const maxTok = passMaxTokens;

      try {
        const res = await callAnthropicWithRetry(
          {
            model: passModel as any,
            system,
            max_tokens: maxTok,
            messages: [{ role: "user", content: [{ type: "text", text: sectionPrompt }] }],
            metadata: {
              cache_control: { type: "ephemeral" },
              system_version: PROMPTS.generation.version,
            } as any,
          },
          { userId }
        );
        sectionHtml = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
        sectionUsage = res.usage ?? null;
      } catch (err) {
        // Retry once with a simpler prompt (no templates).
        try {
          const res = await callAnthropicWithRetry(
            {
              model: passModel as any,
              system: `${system}\n\nSECOND CHANCE:\nUse only the brand profile and section type. No templates.`,
              max_tokens: Math.max(600, Math.floor(maxTok * 0.7)),
              messages: [
                { role: "user", content: [{ type: "text", text: `SECTION TYPE: ${sectionType}\nUSER PROMPT:\n${userPrompt}` }] },
              ],
              metadata: {
                cache_control: { type: "ephemeral" },
                system_version: PROMPTS.generation.version,
              } as any,
            },
            { userId }
          );
          sectionHtml = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
          sectionUsage = res.usage ?? null;
        } catch {
          sectionFailures[sectionType] = (sectionFailures[sectionType] ?? 0) + 1;
          sectionHtml = "";
        }
      }
    }

    const wrapped = ensureWrappedSection(sectionType, sectionHtml);
    if (!cached) await redis.set(cacheKey, wrapped, "EX", 60 * 60);

    if (sectionUsage) {
      const usageInput = sectionUsage.input_tokens ?? 0;
      const usageOutput = sectionUsage.output_tokens ?? 0;
      totalTokens += usageInput + usageOutput;
      cachedTokens +=
        (sectionUsage.cache_read_input_tokens ?? 0) + (sectionUsage.cache_creation_input_tokens ?? 0);
      costUsd += computeUsageCostUsd(passModel, sectionUsage);
    }

    sections[sectionIndex] = wrapped;
    const assembledHtml = await renderAssembled();
    await cb.onSectionComplete?.({
      sectionType,
      sectionIndex,
      sectionHtml: wrapped,
      assembledHtml,
    });
  }

  for (const pass of passPlan) {
    // For each pass, generate all sections in dependency-aware parallel batches.
    const batches = buildDependencyBatches(sectionPlan);
    parallelBatches += batches.length;

    for (const batch of batches) {
      for (const sectionType of batch) {
        const sectionIndex = sectionPlan.indexOf(sectionType);
        await cb.onSectionStart?.({ sectionType, sectionIndex, totalSections: sectionPlan.length });
      }

      await Promise.all(
        batch.map((sectionType) => {
          const sectionIndex = sectionPlan.indexOf(sectionType);
          return generateOneSection(sectionType, sectionIndex, pass.name, pass.passModel, pass.passMaxTokens);
        })
      );
    }
  }

  // PostProcess already ran after last section; reuse the last assembled.
  const finalHtml = await renderAssembled();

  return {
    finalHtml,
    totalTokens,
    cachedTokens,
    costUsd,
    generationTimeMs: Date.now() - startedAt,
    sectionCount,
    parallelBatches,
    sectionFailures,
  };
}

