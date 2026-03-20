import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";
import { getStorageService } from "@/lib/storage";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import sharp from "sharp";

export const runtime = "nodejs";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || typeof file === "string") {
      return fail("VALIDATION_ERROR", "File is required", 400);
    }

    const mimeType = mime.lookup(file.name) || file.type;
    if (!mimeType || !ALLOWED.includes(mimeType)) {
      return fail("VALIDATION_ERROR", "Invalid file type. Allowed: png, jpeg, webp", 400);
    }
    if (file.size > MAX_BYTES) {
      return fail("VALIDATION_ERROR", "File too large. Max 10MB.", 400);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buf).metadata();
    } catch {
      return fail(
        "VALIDATION_ERROR",
        "This file appears to be corrupted or is not a valid image.",
        400
      );
    }

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 200 || height < 200) {
      return fail("VALIDATION_ERROR", "Image is too small. Minimum size is 200x200px.", 400);
    }
    if (width > 8000 || height > 8000) {
      return fail("VALIDATION_ERROR", "Image is too large. Maximum size is 8000x8000px.", 400);
    }

    const stats = await sharp(buf).stats();
    const avgStd =
      stats.channels.reduce((acc, c) => acc + c.stdev, 0) /
      Math.max(1, stats.channels.length);
    const warning =
      avgStd < 10
        ? "This image appears to be mostly blank. Are you sure this is the right reference?"
        : null;

    let visionBuf: Buffer = buf as Buffer;
    if (file.size > 2 * 1024 * 1024) {
      visionBuf = (await sharp(buf)
        .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()) as Buffer;
      if (visionBuf.length > 5 * 1024 * 1024) {
        visionBuf = (await sharp(buf)
          .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer()) as Buffer;
      }
    } else {
      visionBuf = (await sharp(buf)
        .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()) as Buffer;
    }

    const thumbBuf = (await sharp(buf)
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()) as Buffer;

    const id = uuidv4();
    const visionPath = `uploads/${session.user.id}/references/${id}_vision.jpg`;
    const thumbPath = `uploads/${session.user.id}/references/${id}_thumb.jpg`;
    const storage = getStorageService();
    const [visionUrl, thumbnailUrl] = await Promise.all([
      storage.upload(visionBuf, visionPath, "image/jpeg"),
      storage.upload(thumbBuf, thumbPath, "image/jpeg"),
    ]);

    const reference = await prisma.referenceImage.create({
      data: {
        userId: session.user.id,
        originalFilename: file.name,
        visionUrl,
        thumbnailUrl,
      },
    });

    return ok(
      {
        referenceId: reference.id,
        visionUrl,
        thumbnailUrl,
        dimensions: { width, height },
        warning,
      },
      201
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
