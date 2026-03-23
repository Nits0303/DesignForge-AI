import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

const bodySchema = z.object({
  versionNumber: z.number().int().min(1),
  figmaFileKey: z.string().min(1),
  figmaNodeId: z.string().min(1),
  layerCount: z.number().int().min(0),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await validatePluginBearer(req);
  if (!auth) return fail("UNAUTHORIZED", "Invalid or expired token", 401);

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const design = await prisma.design.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!design) return fail("NOT_FOUND", "Design not found", 404);

  const deep = `https://www.figma.com/file/${parsed.data.figmaFileKey}?node-id=${encodeURIComponent(parsed.data.figmaNodeId)}`;

  const exp = await prisma.export.create({
    data: {
      designId: id,
      versionNumber: parsed.data.versionNumber,
      format: "figma_plugin",
      fileUrl: deep,
      figmaUrl: deep,
      figmaFileKey: parsed.data.figmaFileKey,
      figmaNodeId: parsed.data.figmaNodeId,
      fileSizeBytes: parsed.data.layerCount,
    } as any,
  });

  return ok({ exportId: exp.id });
}
