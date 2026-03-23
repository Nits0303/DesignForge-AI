import { prisma } from "@/lib/db/prisma";

export type TemplateSelectionStrategyName =
  | "prefer_high_approval_rate"
  | "prefer_recency"
  | "prefer_diversity";

/** Platform/format defaults for template scoring when no A/B override applies (Sprint 16). */
export async function getPlatformTemplateSelectionDefaults(
  platform: string,
  format: string
): Promise<{
  strategy: TemplateSelectionStrategyName;
  approvalRateMultiplier: number;
}> {
  const row = await prisma.platformDefault.findUnique({
    where: {
      platform_format_key: { platform, format, key: "templateSelectionStrategy" },
    },
  });
  if (!row?.value) {
    return { strategy: "prefer_high_approval_rate", approvalRateMultiplier: 1 };
  }
  const raw = row.value as unknown;
  const v = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (v === "prefer_recency") return { strategy: "prefer_recency", approvalRateMultiplier: 1 };
  if (v === "prefer_diversity") return { strategy: "prefer_diversity", approvalRateMultiplier: 1 };
  if (v === "prefer_high_approval") return { strategy: "prefer_high_approval_rate", approvalRateMultiplier: 2 };
  return { strategy: "prefer_high_approval_rate", approvalRateMultiplier: 1 };
}

/** Promoted A/B `additionalInstruction` applied when no variant supplies one (see `abTestPromoter`). */
export async function getPlatformAdditionalInstruction(platform: string, format: string): Promise<string | null> {
  const row = await prisma.platformDefault.findUnique({
    where: {
      platform_format_key: { platform, format, key: "additionalInstruction" },
    },
  });
  if (row?.value == null) return null;
  const raw = row.value as unknown;
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw === "object" && raw !== null && "text" in raw && typeof (raw as { text?: unknown }).text === "string") {
    return String((raw as { text: string }).text).trim() || null;
  }
  return null;
}
