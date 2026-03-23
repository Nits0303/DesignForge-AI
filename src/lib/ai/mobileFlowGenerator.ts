import { AI_MODELS, getPricingForModel } from "@/constants/models";
import { callAnthropicWithRetry } from "@/lib/ai/anthropicClient";
import { generateOneMobileScreenHtml } from "@/lib/ai/mobileSingleScreenGenerator";
import type { MobileScreenDescriptor, ParsedIntent } from "@/types/ai";
import {
  buildFallbackScreenPlan,
  defaultScreenCountForMobile,
  extractStructuralSummary,
  isMobileFlowFormat,
  padScreenPlan,
} from "@/lib/ai/mobileFlowUtils";

function computeHaikuCostUsd(usage: any): number {
  const p = getPricingForModel(AI_MODELS.ROUTER_HAIKU);
  const inp = usage?.input_tokens ?? 0;
  const out = usage?.output_tokens ?? 0;
  return (inp / 1e6) * p.inputPerMTokens + (out / 1e6) * p.outputPerMTokens;
}

type FlowCb = {
  onScreenStart?: (p: {
    screenIndex: number;
    screenType: string;
    screenTitle: string;
    totalScreens: number;
  }) => void | Promise<void>;
  onScreenComplete?: (p: {
    screenIndex: number;
    screenType: string;
    screenHtml: string;
  }) => void | Promise<void>;
};

async function haikuScreenPlan(args: {
  userId: string;
  intent: ParsedIntent;
  userPrompt: string;
  targetCount: number;
}): Promise<{ plan: MobileScreenDescriptor[]; usage: any }> {
  const system = `You plan mobile app screen flows. Return ONLY valid JSON:
{"screenPlan":[{"screenIndex":0,"screenType":"string","screenTitle":"string","primaryAction":"string","navigationPattern":"next_button|swipe|tab|back_button"}]}
The array must have exactly ${args.targetCount} screens. screenIndex must be 0..${args.targetCount - 1}.`;

  const res = await callAnthropicWithRetry(
    {
      model: AI_MODELS.ROUTER_HAIKU,
      system,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Format: ${args.intent.format}\nApp intent JSON:\n${JSON.stringify(
                args.intent,
                null,
                2
              )}\n\nUser request:\n${args.userPrompt}`,
            },
          ],
        },
      ],
    },
    { userId: args.userId }
  );

  const usage = (res as any).usage;
  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  try {
    const parsed = JSON.parse(text) as { screenPlan?: MobileScreenDescriptor[] };
    if (Array.isArray(parsed.screenPlan) && parsed.screenPlan.length) {
      return {
        plan: padScreenPlan(parsed.screenPlan as MobileScreenDescriptor[], args.targetCount, String(args.intent.format)),
        usage,
      };
    }
  } catch {
    // fall through
  }
  return { plan: buildFallbackScreenPlan(args.intent, args.targetCount), usage };
}

export async function generateMobileFlowHtml(
  args: {
    userId: string;
    brandId: string;
    intent: ParsedIntent;
    userPrompt: string;
    referenceImageUrl?: string;
    model?: string;
    maxTokens?: number;
    strategy?: "fast" | "quality";
  },
  cb: FlowCb
): Promise<{
  finalHtml: string;
  screenCount: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  generationTimeMs: number;
  screenFailures: { index: number; message: string }[];
}> {
  const started = Date.now();
  const targetCount = defaultScreenCountForMobile(String(args.intent.format), args.intent.screenCount);
  let screenPlan: MobileScreenDescriptor[];
  let planHaikuCostUsd = 0;
  let planHaikuTokens = 0;
  if (args.intent.screenPlan && args.intent.screenPlan.length > 0) {
    screenPlan = padScreenPlan(args.intent.screenPlan, targetCount, String(args.intent.format));
  } else {
    const { plan, usage } = await haikuScreenPlan({
      userId: args.userId,
      intent: args.intent,
      userPrompt: args.userPrompt,
      targetCount,
    });
    planHaikuCostUsd = computeHaikuCostUsd(usage);
    planHaikuTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
    screenPlan = padScreenPlan(plan, targetCount, String(args.intent.format));
  }

  const intentWithPlan: ParsedIntent = {
    ...args.intent,
    screenPlan,
    screenCount: screenPlan.length,
  };

  const screens: string[] = [];
  const screenFailures: { index: number; message: string }[] = [];
  let totalTokens = planHaikuTokens;
  let cachedTokens = 0;
  let costUsdAcc = planHaikuCostUsd;
  let previousXml = "";

  for (let i = 0; i < screenPlan.length; i++) {
    const descriptor = screenPlan[i]!;
    await cb.onScreenStart?.({
      screenIndex: i,
      screenType: descriptor.screenType,
      screenTitle: descriptor.screenTitle,
      totalScreens: screenPlan.length,
    });

    const one = await generateOneMobileScreenHtml({
      userId: args.userId,
      brandId: args.brandId,
      intent: intentWithPlan,
      userPrompt: args.userPrompt,
      screenIndex: i,
      totalScreens: screenPlan.length,
      screenDescriptor: descriptor,
      previousScreensXml: previousXml || undefined,
      referenceImageUrl: args.referenceImageUrl,
    });

    totalTokens += one.totalTokens;
    cachedTokens += one.cachedTokens;
    costUsdAcc += one.costUsd;

    let html = one.html;
    if (one.failureMessage) {
      screenFailures.push({ index: i, message: one.failureMessage });
    }

    screens.push(html);
    previousXml = extractStructuralSummary(html);

    await cb.onScreenComplete?.({
      screenIndex: i,
      screenType: descriptor.screenType,
      screenHtml: html,
    });
  }

  const finalHtml = JSON.stringify(screens);

  return {
    finalHtml,
    screenCount: screens.length,
    totalTokens,
    cachedTokens,
    costUsd: Number(costUsdAcc.toFixed(6)),
    generationTimeMs: Date.now() - started,
    screenFailures,
  };
}

export function shouldUseMobileFlowGenerator(intent: ParsedIntent): boolean {
  return intent.platform === "mobile" && isMobileFlowFormat(String(intent.format));
}
