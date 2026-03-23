import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { AI_MODELS } from "@/constants/models";
import { generateOneMobileScreenHtml } from "@/lib/ai/mobileSingleScreenGenerator";
import { extractStructuralSummary, padScreenPlan } from "@/lib/ai/mobileFlowUtils";
import type { MobileScreenDescriptor, ParsedIntent } from "@/types/ai";

export const runtime = "nodejs";

const bodySchema = z.object({
  designId: z.string().cuid(),
  newScreenTypes: z.array(z.string().min(1).max(64)).min(1).max(8),
});

function toParsedIntent(design: {
  platform: string;
  format: string;
  dimensions: unknown;
  parsedIntent: unknown;
}): ParsedIntent {
  if (design.parsedIntent && typeof design.parsedIntent === "object") {
    return design.parsedIntent as ParsedIntent;
  }
  return {
    platform: design.platform as ParsedIntent["platform"],
    format: design.format,
    dimensions: design.dimensions as ParsedIntent["dimensions"],
  };
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const design = await prisma.design.findFirst({
      where: { id: parsed.data.designId, userId: session.user.id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!design) return fail("NOT_FOUND", "Design not found", 404);
    if (!design.brandId) return fail("INVALID_STATE", "Design has no brand profile", 400);

    const v = design.versions[0];
    if (!v?.isMultiScreen) {
      return fail("INVALID_STATE", "Design is not a multi-screen mobile flow", 400);
    }

    let screens: string[] = [];
    try {
      screens = JSON.parse(v.htmlContent) as string[];
    } catch {
      return fail("INVALID_STATE", "Could not parse multi-screen HTML", 400);
    }
    if (!Array.isArray(screens) || screens.length < 1) {
      return fail("INVALID_STATE", "No screens to extend from", 400);
    }

    const intent = toParsedIntent(design);
    const existingPlan = padScreenPlan(intent.screenPlan ?? [], screens.length, String(design.format));

    const newDescriptors: MobileScreenDescriptor[] = parsed.data.newScreenTypes.map((type, j) => {
      const idx = screens.length + j;
      const title = type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        screenIndex: idx,
        screenType: type,
        screenTitle: title,
        primaryAction: "Next",
        navigationPattern: "next_button" as const,
      };
    });

    const newTotal = screens.length + newDescriptors.length;
    const fullPlan: MobileScreenDescriptor[] = [...existingPlan, ...newDescriptors];

    const intentExtended: ParsedIntent = {
      ...intent,
      screenPlan: fullPlan,
      screenCount: newTotal,
    };

    let workingScreens = [...screens];
    let previousXml = extractStructuralSummary(workingScreens[workingScreens.length - 1]!);
    let totalTokens = 0;
    let cachedTokens = 0;
    let costUsdAcc = 0;
    const failures: string[] = [];

    for (let j = 0; j < newDescriptors.length; j++) {
      const globalIdx = screens.length + j;
      const desc = newDescriptors[j]!;
      const gen = await generateOneMobileScreenHtml({
        userId: session.user.id,
        brandId: design.brandId,
        intent: intentExtended,
        userPrompt: design.originalPrompt,
        screenIndex: globalIdx,
        totalScreens: newTotal,
        screenDescriptor: desc,
        previousScreensXml: previousXml,
      });

      totalTokens += gen.totalTokens;
      cachedTokens += gen.cachedTokens;
      costUsdAcc += gen.costUsd;

      if (gen.failureMessage || !gen.html.trim()) {
        failures.push(`Screen ${globalIdx + 1}: ${gen.failureMessage ?? "empty output"}`);
        workingScreens.push(
          `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px;"><p>Screen failed to generate.</p></body></html>`
        );
      } else {
        workingScreens.push(gen.html);
      }
      previousXml = extractStructuralSummary(workingScreens[workingScreens.length - 1]!);
    }

    const nextVersion = design.currentVersion + 1;
    await prisma.designVersion.create({
      data: {
        designId: design.id,
        versionNumber: nextVersion,
        htmlContent: JSON.stringify(workingScreens),
        revisionPrompt: `extend-flow:+${newDescriptors.length}`,
        aiModelUsed: AI_MODELS.GENERATOR_SONNET,
        promptTokens: totalTokens,
        completionTokens: null,
        cachedTokens,
        generationTimeMs: Date.now() - started,
        isMultiScreen: true,
        screenCount: workingScreens.length,
      },
    });

    await prisma.design.update({
      where: { id: design.id },
      data: {
        currentVersion: nextVersion,
        status: "preview",
        updatedAt: new Date(),
        parsedIntent: intentExtended as any,
      },
    });

    return ok({
      designId: design.id,
      versionNumber: nextVersion,
      screenCount: workingScreens.length,
      addedScreens: newDescriptors.length,
      costUsd: Number(costUsdAcc.toFixed(6)),
      generationTimeMs: Date.now() - started,
      failures: failures.length ? failures : undefined,
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
