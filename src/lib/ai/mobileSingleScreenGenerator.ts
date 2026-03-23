import { prisma } from "@/lib/db/prisma";
import { AI_MODELS, AI_PRICING } from "@/constants/models";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { assembleGenerationPrompt } from "@/lib/ai/promptAssembler";
import { selectTemplatesForIntent } from "@/lib/ai/componentSelector";
import { postProcessHtml } from "@/lib/ai/htmlPostProcessor";
import type { MobileScreenDescriptor, ParsedIntent } from "@/types/ai";

function computeSonnetCostUsd(usage: any): number {
  const pricing = AI_PRICING.SONNET;
  const inp = usage?.input_tokens ?? 0;
  const out = usage?.output_tokens ?? 0;
  const cr = usage?.cache_read_input_tokens ?? 0;
  const cw = usage?.cache_creation_input_tokens ?? 0;
  return (
    (inp / 1e6) * pricing.inputPerMTokens +
    (out / 1e6) * pricing.outputPerMTokens +
    (cw / 1e6) * pricing.inputPerMTokens +
    (cr / 1e6) * pricing.inputPerMTokens * AI_PRICING.CACHE_READ_DISCOUNT
  );
}

/**
 * Builds a full `screenPlan` array for prompts, filling gaps and pinning the active descriptor.
 */
function buildScreenPlanForPrompt(
  intent: ParsedIntent,
  totalScreens: number,
  screenIndex: number,
  screenDescriptor: MobileScreenDescriptor
): ParsedIntent {
  const fmt = String(intent.format);
  const base: MobileScreenDescriptor[] = [];
  const existing = intent.screenPlan ?? [];
  for (let i = 0; i < totalScreens; i++) {
    if (i === screenIndex) {
      base[i] = { ...screenDescriptor, screenIndex: i };
    } else if (existing[i]) {
      base[i] = { ...existing[i]!, screenIndex: i };
    } else {
      base[i] = {
        screenIndex: i,
        screenType: `screen_${i + 1}`,
        screenTitle: `Screen ${i + 1}`,
        primaryAction: "Next",
        navigationPattern: i === 0 ? "next_button" : "back_button",
      };
    }
  }
  return {
    ...intent,
    screenPlan: base,
    screenCount: totalScreens,
  };
}

/**
 * Generates one mobile flow screen (used by full flow generator, regenerate-screen, extend-flow).
 */
export async function generateOneMobileScreenHtml(args: {
  userId: string;
  brandId: string;
  intent: ParsedIntent;
  userPrompt: string;
  screenIndex: number;
  totalScreens: number;
  screenDescriptor: MobileScreenDescriptor;
  previousScreensXml?: string;
  referenceImageUrl?: string;
}): Promise<{
  html: string;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  failureMessage?: string;
}> {
  const brand = await prisma.brandProfile.findFirst({
    where: { id: args.brandId, userId: args.userId },
  });
  if (!brand) throw new Error("Brand not found");

  const intentWithPlan = buildScreenPlanForPrompt(
    args.intent,
    args.totalScreens,
    args.screenIndex,
    args.screenDescriptor
  );

  const templates = await selectTemplatesForIntent(intentWithPlan, {
    userId: args.userId,
    templateSelectionStrategy: "prefer_high_approval_rate",
  });

  const { system, messages } = await assembleGenerationPrompt({
    userId: args.userId,
    brandId: args.brandId,
    intent: intentWithPlan,
    templates,
    userPrompt: args.userPrompt,
    referenceImageUrl: args.referenceImageUrl,
    referenceAnalyses: [],
    mobileGenerationContext: {
      screenIndex: args.screenIndex,
      totalScreens: args.totalScreens,
      screenDescriptor: intentWithPlan.screenPlan![args.screenIndex]!,
      previousScreensXml: args.previousScreensXml,
    },
  });

  const perScreenMax = 2500;
  const msg = await callAnthropicWithRetry(
    {
      model: AI_MODELS.GENERATOR_SONNET,
      system,
      max_tokens: perScreenMax,
      messages: messages as any,
    },
    { userId: args.userId }
  );

  const usage = (msg as any).usage;
  const totalTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  const cachedTokens =
    (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
  const costUsd = computeSonnetCostUsd(usage);

  let html = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";

  try {
    const repaired = await postProcessHtml({
      html,
      intent: intentWithPlan,
      brand: {
        name: brand.name,
        typography: brand.typography as any,
        colors: brand.colors as any,
      },
      repairMalformedHtml: async (malformedHtml) => malformedHtml,
    });
    html = repaired.html;
  } catch (e: any) {
    return {
      html: "",
      totalTokens,
      cachedTokens,
      costUsd,
      failureMessage: e?.message ?? "post-process",
    };
  }

  return { html, totalTokens, cachedTokens, costUsd };
}
