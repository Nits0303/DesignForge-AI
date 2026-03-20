import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function generateShareToken() {
  // 32 char token (16 bytes hex)
  return crypto.randomBytes(16).toString("hex");
}

export async function exportFigmaBridge({
  designId,
  versionNumber,
}: {
  designId: string;
  versionNumber?: number | null;
}): Promise<{ shareUrl: string; expiresAt: string; instructions: string[]; exportId: string }> {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    select: { id: true, currentVersion: true },
  });

  if (!design) throw new Error("Design not found");

  const targetVersionNumber = versionNumber ?? design.currentVersion;

  // Create a temporary ShareLink for the public preview route.
  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.shareLink.create({
    data: {
      token,
      designId,
      versionNumber: targetVersionNumber,
      expiresAt,
    },
  });

  const shareUrl = `${getAppBaseUrl()}/preview/${token}`;

  // Store an Export record for history/audit.
  const exportRec = await prisma.export.create({
    data: {
      designId,
      versionNumber: targetVersionNumber,
      format: "figma_bridge",
      fileUrl: shareUrl,
      figmaUrl: shareUrl,
      fileSizeBytes: null,
    } as any,
  });

  await prisma.design.update({
    where: { id: designId },
    data: { status: "exported" },
  });

  const instructions = [
    "Open Figma and install the html.to.design plugin (one-time setup).",
    "In Figma, open the html.to.design plugin.",
    "Paste the following URL into the plugin.",
    "Click Import — your design will appear as editable Figma layers.",
    `Note: this link expires in 24 hours.`,
  ];

  return { shareUrl, expiresAt: expiresAt.toISOString(), instructions, exportId: exportRec.id };
}

