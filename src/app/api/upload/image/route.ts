import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";
import { getStorageService } from "@/lib/storage";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import sharp from "sharp";

export const runtime = "nodejs";

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
];
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const invalid = (message: string, extra?: Record<string, unknown>) => {
    console.warn("[upload/image] validation failed", { message, ...(extra ?? {}) });
    return fail("VALIDATION_ERROR", message, 400);
  };
  try {
    const session = await getRequiredSession();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || typeof file === "string") {
      return invalid("File is required");
    }

    const mimeType = (mime.lookup(file.name) || file.type || "").toString().toLowerCase();
    const isImageByMime = mimeType.startsWith("image/");
    const ext = (mime.extension(mimeType) || "").toLowerCase();
    const isKnownImageExt = ["png", "jpg", "jpeg", "webp", "avif", "heic", "heif"].includes(ext);
    if (!isImageByMime && !isKnownImageExt) {
      return invalid(
        "Invalid file type. Allowed image formats: png, jpg, jpeg, webp, avif, heic, heif.",
        { filename: file.name, mimeType, ext, fileType: file.type }
      );
    }
    if (file.size > MAX_BYTES) {
      return invalid("File too large. Max 10MB.", { filename: file.name, size: file.size });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buf).metadata();
    } catch {
      return invalid(
        "This file appears to be corrupted or is not a valid image.",
        { filename: file.name, mimeType, ext, size: file.size }
      );
    }
    const parsedFormat = String(meta.format ?? "").toLowerCase();
    const isSupportedDecodedFormat = ["jpeg", "png", "webp", "avif", "heif", "heic"].includes(parsedFormat);
    if (!isSupportedDecodedFormat) {
      return invalid(
        "Unsupported or unreadable image format. Please upload PNG, JPG, JPEG, WEBP, AVIF, or HEIC.",
        { filename: file.name, decodedFormat: parsedFormat, mimeType, ext }
      );
    }

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    // Reference images can be banner-shaped (e.g. 311x162). Accept smaller
    // assets as long as they still carry enough visual signal for style extraction.
    const minShortSide = 120;
    const minArea = 24_000;
    const shortSide = Math.min(width, height);
    if (shortSide < minShortSide || width * height < minArea) {
      return invalid(
        `Image is too small. Minimum short side is ${minShortSide}px and minimum area is ${minArea.toLocaleString()}px.`,
        {
          filename: file.name,
          width,
          height,
          shortSide,
          area: width * height,
        }
      );
    }
    if (width > 8000 || height > 8000) {
      return invalid("Image is too large. Maximum size is 8000x8000px.", {
        filename: file.name,
        width,
        height,
      });
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
    console.error("[upload/image] unexpected error", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
