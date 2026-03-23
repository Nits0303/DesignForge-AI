import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { PromotionLog } from "@prisma/client";
import { emitDesignForgeWebhook } from "@/lib/webhooks/deliver";
import { GENERATION_SYSTEM_PROMPT } from "@/lib/ai/prompts/generationSystemPrompt";

/**
 * Apply winning variant settings to SystemPromptDefault / PlatformDefault and log PromotionLog.
 * When `additionalInstruction` is present, registers a `DynamicPromptVersion` row and stores the
 * instruction as `PlatformDefault` `additionalInstruction` so non–A/B traffic picks it up.
 */
export async function checkPromotionConflict(
  platform: string,
  format: string,
  hours = 24
): Promise<PromotionLog | null> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return prisma.promotionLog.findFirst({
    where: {
      promotedAt: { gte: since },
      revertedAt: null,
      test: { platform, format },
    },
    orderBy: { promotedAt: "desc" },
  });
}

export async function promoteAbTestWinner(args: {
  testId: string;
  winnerVariantId: string;
  promotedByUserId?: string | null;
}): Promise<{ promotionLogId: string }> {
  const test = await prisma.promptABTest.findUnique({ where: { id: args.testId } });
  if (!test) throw new Error("Test not found");

  const variants = (test.variants as Array<{ id: string; promptModifications?: Record<string, unknown> }>) ?? [];
  const winner = variants.find((v) => String(v.id) === args.winnerVariantId);
  const mods = (winner?.promptModifications ?? {}) as Record<string, unknown>;

  const description = `Promoted variant ${args.winnerVariantId} for ${test.platform}/${test.format}`;

  const log = await prisma.promotionLog.create({
    data: {
      testId: args.testId,
      winnerVariantId: args.winnerVariantId,
      promotedByUserId: args.promotedByUserId ?? null,
      changeDescription: description,
      newValue: mods as object,
    },
  });

  const additionalInstruction =
    typeof mods.additionalInstruction === "string" ? mods.additionalInstruction.trim() : "";
  const explicitSystemVersion = typeof mods.systemPromptVersion === "string" && mods.systemPromptVersion.trim();
  let promotedRegistryKey: string | null = null;

  if (additionalInstruction) {
    await prisma.platformDefault.upsert({
      where: {
        platform_format_key: {
          platform: test.platform,
          format: test.format,
          key: "additionalInstruction",
        },
      },
      create: {
        platform: test.platform,
        format: test.format,
        key: "additionalInstruction",
        value: additionalInstruction,
      },
      update: { value: additionalInstruction },
    });
    if (!explicitSystemVersion) {
      promotedRegistryKey = `promoted-${crypto.randomBytes(10).toString("hex")}`;
      await prisma.dynamicPromptVersion.create({
        data: {
          versionKey: promotedRegistryKey,
          content: GENERATION_SYSTEM_PROMPT,
          description: `Promoted from test ${test.name} (${test.id}): ${additionalInstruction.slice(0, 240)}`,
          sourceTestId: test.id,
        },
      });
    }
  }

  if (typeof mods.systemPromptVersion === "string") {
    await prisma.systemPromptDefault.upsert({
      where: {
        platform_format: { platform: test.platform, format: test.format },
      },
      create: {
        platform: test.platform,
        format: test.format,
        systemPromptVersion: mods.systemPromptVersion,
      },
      update: { systemPromptVersion: mods.systemPromptVersion },
    });
  } else if (promotedRegistryKey) {
    await prisma.systemPromptDefault.upsert({
      where: {
        platform_format: { platform: test.platform, format: test.format },
      },
      create: {
        platform: test.platform,
        format: test.format,
        systemPromptVersion: promotedRegistryKey,
      },
      update: { systemPromptVersion: promotedRegistryKey },
    });
  }

  if (typeof mods.templateSelectionStrategy === "string") {
    await prisma.platformDefault.upsert({
      where: {
        platform_format_key: {
          platform: test.platform,
          format: test.format,
          key: "templateSelectionStrategy",
        },
      },
      create: {
        platform: test.platform,
        format: test.format,
        key: "templateSelectionStrategy",
        value: mods.templateSelectionStrategy,
      },
      update: { value: mods.templateSelectionStrategy },
    });
  }

  emitDesignForgeWebhook("test.promoted", {
    testId: args.testId,
    winnerVariantId: args.winnerVariantId,
    platform: test.platform,
    format: test.format,
    testName: test.name,
    ...(promotedRegistryKey ? { registeredPromptVersionKey: promotedRegistryKey } : {}),
  });

  return { promotionLogId: log.id };
}
