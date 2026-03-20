import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getStorageService, storagePathFromPublicUrl } from "@/lib/storage";

const putSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  tags: z.array(z.string()).optional(),
  isSaved: z.boolean().optional(),
});

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;
    const json = await req.json();
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const ref = await prisma.referenceImage.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!ref) return fail("NOT_FOUND", "Reference not found", 404);

    const updated = await prisma.referenceImage.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
        ...(parsed.data.isSaved !== undefined ? { isSaved: parsed.data.isSaved } : {}),
      },
    });

    return ok(updated);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "Failed to update reference", 500);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;
    const ref = await prisma.referenceImage.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!ref) return fail("NOT_FOUND", "Reference not found", 404);

    const storage = getStorageService();
    const vp = storagePathFromPublicUrl(ref.visionUrl);
    const tp = storagePathFromPublicUrl(ref.thumbnailUrl);
    if (vp) await storage.delete(vp).catch(() => {});
    if (tp) await storage.delete(tp).catch(() => {});

    await prisma.referenceImage.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "Failed to delete reference", 500);
  }
}

