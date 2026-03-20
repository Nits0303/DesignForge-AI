import { NextRequest } from "next/server";
import mime from "mime-types";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { getStorageService } from "@/lib/storage";
import { ok, fail } from "@/lib/api/response";
import { APP_LIMITS } from "@/constants/limits";
import { invalidateBrandCache } from "@/lib/db/brandQueries";

export const runtime = "nodejs";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await params;

    const brand = await prisma.brandProfile.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!brand) return fail("NOT_FOUND", "Not found", 404);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) ?? "other";
    if (!file || typeof file === "string") {
      return fail("VALIDATION_ERROR", "File is required", 400);
    }

    const mimeType = (mime.lookup(file.name) || file.type) as string;
    if (!mimeType || !ALLOWED.includes(mimeType)) {
      return fail("VALIDATION_ERROR", "Invalid file type", 400);
    }
    if (file.size > APP_LIMITS.MAX_FILE_UPLOAD_SIZE_BYTES) {
      return fail("VALIDATION_ERROR", "File too large. Max 10MB.", 400);
    }

    const ext = mime.extension(mimeType) ?? "png";
    const path = `uploads/${session.user.id}/brand/${uuidv4()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const storage = getStorageService();
    const fileUrl = await storage.upload(buf, path, mimeType);

    const asset = await prisma.brandAsset.create({
      data: {
        brandId: brand.id,
        fileUrl,
        fileName: file.name,
        fileType: mimeType,
        category: category as any,
      },
    });

    await invalidateBrandCache(id, session.user.id);
    return ok(asset, 201);
  } catch (err) {
    console.error("Brand asset upload error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

