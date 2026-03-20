import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";
import { prisma } from "@/lib/db/prisma";
import { getStorageService } from "@/lib/storage";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { APP_LIMITS } from "@/constants/limits";

export const runtime = "nodejs";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = APP_LIMITS.MAX_BRAND_ASSET_UPLOAD_SIZE_BYTES;

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const brandId = formData.get("brandId") as string | null;
    const category = (formData.get("category") as string) ?? "logo";

    if (!file || typeof file === "string") {
      return fail("VALIDATION_ERROR", "File is required", 400);
    }

    const mimeType = mime.lookup(file.name) || file.type;
    if (!mimeType || !ALLOWED.includes(mimeType)) {
      return fail("VALIDATION_ERROR", "Invalid file type. Allowed: png, jpeg, webp, svg", 400);
    }

    if (file.size > MAX_BYTES) {
      return fail("VALIDATION_ERROR", "File too large. Max 5MB.", 400);
    }

    const ext = mime.extension(mimeType) ?? "png";
    const path = `uploads/${session.user.id}/brand/${uuidv4()}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const storage = getStorageService();
    const fileUrl = await storage.upload(buf, path, mimeType);

    let assetId: string | undefined;
    if (brandId) {
      const asset = await prisma.brandAsset.create({
        data: {
          brandId,
          fileUrl,
          fileName: file.name,
          fileType: mimeType,
          category: category as "logo" | "product" | "team" | "background" | "other",
        },
      });
      assetId = asset.id;
    }

    return ok({ id: assetId, fileUrl }, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    console.error("Upload error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
