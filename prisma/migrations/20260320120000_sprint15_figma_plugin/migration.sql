-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "metadata" JSONB;

-- AlterTable
ALTER TABLE "Export" ADD COLUMN "figmaFileKey" TEXT;
ALTER TABLE "Export" ADD COLUMN "figmaNodeId" TEXT;

-- CreateTable
CREATE TABLE "PluginToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Figma Plugin',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginToken_tokenHash_key" ON "PluginToken"("tokenHash");
CREATE INDEX "PluginToken_userId_idx" ON "PluginToken"("userId");
CREATE INDEX "PluginToken_expiresAt_idx" ON "PluginToken"("expiresAt");

ALTER TABLE "PluginToken" ADD CONSTRAINT "PluginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PluginFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PluginFeedback_userId_createdAt_idx" ON "PluginFeedback"("userId", "createdAt");

ALTER TABLE "PluginFeedback" ADD CONSTRAINT "PluginFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Notification_userId_type_isRead_idx" ON "Notification"("userId", "type", "isRead");
