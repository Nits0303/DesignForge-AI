import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { AI_MODELS } from "@/constants/models";
import { generateOneMobileScreenHtml } from "@/lib/ai/mobileSingleScreenGenerator";
import { extractStructuralSummary, padScreenPlan } from "@/lib/ai/mobileFlowUtils";
import type { ParsedIntent } from "@/types/ai";

export const runtime = "nodejs";

const bodySchema = z.object({
  designId: z.string().cuid(),
  screenIndex: z.number().int().min(0),
  /** Optional extra instruction for this screen only. */
  hint: z.string().max(2000).optional(),
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
    if (!Array.isArray(screens) || parsed.data.screenIndex >= screens.length) {
      return fail("VALIDATION_ERROR", "Invalid screen index", 400);
    }

    const intent = toParsedIntent(design);
    const screenIndex = parsed.data.screenIndex;
    const plan = padScreenPlan(intent.screenPlan ?? [], screens.length, String(design.format));
    const descriptor = { ...plan[screenIndex]!, screenIndex };

    const previousXml =
      screenIndex > 0 ? extractStructuralSummary(screens[screenIndex - 1]!) : undefined;

    const userPrompt = parsed.data.hint
      ? `${design.originalPrompt}\n\n(Screen ${screenIndex + 1} only): ${parsed.data.hint}`
      : design.originalPrompt;

    const gen = await generateOneMobileScreenHtml({
      userId: session.user.id,
      brandId: design.brandId,
      intent,
      userPrompt,
      screenIndex,
      totalScreens: screens.length,
      screenDescriptor: descriptor,
      previousScreensXml: previousXml,
    });

    if (gen.failureMessage || !gen.html.trim()) {
      return fail(
        "GENERATION_FAILED",
        gen.failureMessage ?? "Could not regenerate this screen",
        422
      );
    }

    const nextScreens = [...screens];
    nextScreens[screenIndex] = gen.html;

    const nextVersion = design.currentVersion + 1;
    await prisma.designVersion.create({
      data: {
        designId: design.id,
        versionNumber: nextVersion,
        htmlContent: JSON.stringify(nextScreens),
        revisionPrompt: parsed.data.hint ?? `regenerate-screen:${screenIndex}`,
        aiModelUsed: AI_MODELS.GENERATOR_SONNET,
        promptTokens: gen.totalTokens,
        completionTokens: null,
        cachedTokens: gen.cachedTokens,
        generationTimeMs: Date.now() - started,
        isMultiScreen: true,
        screenCount: nextScreens.length,
      },
    });

    await prisma.design.update({
      where: { id: design.id },
      data: {
        currentVersion: nextVersion,
        status: "preview",
        updatedAt: new Date(),
      },
    });

    return ok({
      designId: design.id,
      versionNumber: nextVersion,
      screenIndex,
      costUsd: gen.costUsd,
      generationTimeMs: Date.now() - started,
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
