-- Sprint 16 — A/B testing framework (partial migration; run `npx prisma db push` if drifted)
-- Enum: add paused
ALTER TYPE "PromptABTestStatus" ADD VALUE IF NOT EXISTS 'paused';

ALTER TABLE "GenerationLog" ADD COLUMN IF NOT EXISTS "testAssignments" JSONB;
ALTER TABLE "GenerationLog" ADD COLUMN IF NOT EXISTS "generationTimeMs" INTEGER;

ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "winnerConfidence" DOUBLE PRECISION;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "significanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.05;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "autoPromoteWinner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "excludeNewUsers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "holdbackPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "significanceCheckCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PromptABTest" ADD COLUMN IF NOT EXISTS "minimumDetectableEffect" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "PromptABTest_status_platform_format_idx" ON "PromptABTest"("status", "platform", "format");

CREATE TABLE IF NOT EXISTS "ABTestResult" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantResults" JSONB NOT NULL,
    "significanceResult" JSONB,
    "recommendedWinner" TEXT,
    "sampleSufficient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ABTestResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ABTestResult_testId_computedAt_idx" ON "ABTestResult"("testId", "computedAt" DESC);
ALTER TABLE "ABTestResult" DROP CONSTRAINT IF EXISTS "ABTestResult_testId_fkey";
ALTER TABLE "ABTestResult" ADD CONSTRAINT "ABTestResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "PromptABTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SystemPromptDefault" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "systemPromptVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemPromptDefault_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemPromptDefault_platform_format_key" ON "SystemPromptDefault"("platform", "format");

CREATE TABLE IF NOT EXISTS "PlatformDefault" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformDefault_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformDefault_platform_format_key_key" ON "PlatformDefault"("platform", "format", "key");

CREATE TABLE IF NOT EXISTS "PromotionLog" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "winnerVariantId" TEXT NOT NULL,
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedByUserId" TEXT,
    "changeDescription" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "revertedAt" TIMESTAMP(3),
    CONSTRAINT "PromotionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PromotionLog_testId_promotedAt_idx" ON "PromotionLog"("testId", "promotedAt");
ALTER TABLE "PromotionLog" DROP CONSTRAINT IF EXISTS "PromotionLog_testId_fkey";
ALTER TABLE "PromotionLog" ADD CONSTRAINT "PromotionLog_testId_fkey" FOREIGN KEY ("testId") REFERENCES "PromptABTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionLog" DROP CONSTRAINT IF EXISTS "PromotionLog_promotedByUserId_fkey";
ALTER TABLE "PromotionLog" ADD CONSTRAINT "PromotionLog_promotedByUserId_fkey" FOREIGN KEY ("promotedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ABTestSuggestion" (
    "id" TEXT NOT NULL,
    "suggestedTestConfig" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "expectedEffect" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ABTestSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ABTestSuggestion_status_createdAt_idx" ON "ABTestSuggestion"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "WebhookConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebhookConfig_userId_idx" ON "WebhookConfig"("userId");
ALTER TABLE "WebhookConfig" DROP CONSTRAINT IF EXISTS "WebhookConfig_userId_fkey";
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WebhookDeliveryLog" (
    "id" TEXT NOT NULL,
    "webhookConfigId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDeliveryLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebhookDeliveryLog_webhookConfigId_createdAt_idx" ON "WebhookDeliveryLog"("webhookConfigId", "createdAt");
ALTER TABLE "WebhookDeliveryLog" DROP CONSTRAINT IF EXISTS "WebhookDeliveryLog_webhookConfigId_fkey";
ALTER TABLE "WebhookDeliveryLog" ADD CONSTRAINT "WebhookDeliveryLog_webhookConfigId_fkey" FOREIGN KEY ("webhookConfigId") REFERENCES "WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_createdAbTests_fkey";
ALTER TABLE "PromptABTest" DROP CONSTRAINT IF EXISTS "PromptABTest_createdByUserId_fkey";
ALTER TABLE "PromptABTest" ADD CONSTRAINT "PromptABTest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
