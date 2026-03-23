import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

const putSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().min(1).optional(),
  templateIds: z.array(z.string()).optional(),
  coverImageUrl: z.string().optional().nullable(),
  isPublic: z.boolean().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await ctx.params;
    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const existing = await prisma.templateCollection.findFirst({ where: { id } });
    if (!existing) return fail("NOT_FOUND", "Collection not found", 404);

    const row = await prisma.templateCollection.update({
      where: { id },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.description != null ? { description: parsed.data.description } : {}),
        ...(parsed.data.templateIds != null ? { templateIds: parsed.data.templateIds as any } : {}),
        ...(parsed.data.coverImageUrl !== undefined ? { coverImageUrl: parsed.data.coverImageUrl } : {}),
        ...(parsed.data.isPublic != null ? { isPublic: parsed.data.isPublic } : {}),
      },
    });
    return ok({ collection: row }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Update failed", 500);
  }
}
