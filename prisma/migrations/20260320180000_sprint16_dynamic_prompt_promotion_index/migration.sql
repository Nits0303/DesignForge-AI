-- Dynamic prompt versions (promoted A/B winners) + promotion index
CREATE TABLE IF NOT EXISTS "DynamicPromptVersion" (
    "id" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sourceTestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DynamicPromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DynamicPromptVersion_versionKey_key" ON "DynamicPromptVersion"("versionKey");
CREATE INDEX IF NOT EXISTS "DynamicPromptVersion_createdAt_idx" ON "DynamicPromptVersion"("createdAt");

CREATE INDEX IF NOT EXISTS "PromotionLog_promotedAt_idx" ON "PromotionLog"("promotedAt");
