import { prisma } from "@/lib/db/prisma";
import { getStorageService } from "@/lib/storage";

const PUPPETEER_URL =
  process.env.PUPPETEER_SERVICE_URL ?? "http://localhost:3001/render-template";

export async function generateTemplatePreview(templateId: string) {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || template.previewUrl) return;

  const res = await fetch(PUPPETEER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html: template.htmlSnippet,
      width: 600,
      height: 400,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to render preview for template ${templateId}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const storage = getStorageService();
  const path = `previews/templates/${templateId}.png`;
  const url = await storage.upload(buffer, path, "image/png");

  await prisma.template.update({
    where: { id: templateId },
    data: { previewUrl: url },
  });
}

