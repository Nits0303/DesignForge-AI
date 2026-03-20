import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { getStorageService, storagePathFromPublicUrl } from "@/lib/storage";
import { fail } from "@/lib/api/response";
import { invalidateBrandCache } from "@/lib/db/brandQueries";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const session = await getRequiredSession();
    const { id, assetId } = await params;

    const asset = await prisma.brandAsset.findFirst({
      where: { id: assetId, brandId: id },
      include: { brand: true },
    });

    if (!asset || asset.brand.userId !== session.user.id) {
      return fail("NOT_FOUND", "Not found", 404);
    }

    const storagePath = storagePathFromPublicUrl(asset.fileUrl);
    if (storagePath) {
      try {
        await getStorageService().delete(storagePath);
      } catch {}
    }

    await prisma.brandAsset.delete({ where: { id: asset.id } });
    await invalidateBrandCache(id, session.user.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("Asset delete error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

