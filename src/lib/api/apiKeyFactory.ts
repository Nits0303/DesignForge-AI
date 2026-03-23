import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { ApiRateLimitTier } from "@prisma/client";

export function generateRawApiKey(): string {
  return `dfa_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function keyPrefixFromRaw(raw: string): string {
  return raw.slice(0, 8);
}

export async function createApiKeyRecord(args: {
  userId: string;
  teamId?: string | null;
  name: string;
  permissions: string[];
  expiresAt?: Date | null;
  webhookUrl?: string | null;
  webhookBatchItemEvents?: boolean;
  rateLimitTier?: ApiRateLimitTier;
}): Promise<{ rawKey: string; record: Awaited<ReturnType<typeof prisma.apiKey.create>> }> {
  const rawKey = generateRawApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = keyPrefixFromRaw(rawKey);
  const webhookSecret =
    args.webhookUrl && args.webhookUrl.length > 0 ? crypto.randomBytes(32).toString("hex") : null;

  const record = await prisma.apiKey.create({
    data: {
      userId: args.userId,
      teamId: args.teamId ?? null,
      name: args.name.trim().slice(0, 120),
      keyPrefix,
      keyHash,
      permissions: args.permissions as object,
      status: "active",
      expiresAt: args.expiresAt ?? null,
      rateLimitTier: args.rateLimitTier ?? "standard",
      webhookUrl: args.webhookUrl?.trim() || null,
      webhookSecret,
      webhookBatchItemEvents: args.webhookBatchItemEvents ?? false,
    },
  });

  return { rawKey, record };
}
