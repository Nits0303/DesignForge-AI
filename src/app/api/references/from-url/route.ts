import { z } from "zod";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { getRequiredSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { puppeteerClient } from "@/lib/export/puppeteerClient";
import { getStorageService } from "@/lib/storage";
import { prisma } from "@/lib/db/prisma";

const bodySchema = z.object({
  url: z.string().url(),
});

function isHttpsPublicUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = (u.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host.startsWith("10.")) return false;
    if (host.startsWith("192.168.")) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid URL", 400);

    const { url } = parsed.data;
    if (!isHttpsPublicUrl(url)) {
      return fail("VALIDATION_ERROR", "Only public https URLs are allowed", 400);
    }

    const rl = await checkRateLimit(`ref:url:${session.user.id}`, {
      windowSeconds: 3600,
      maxRequests: 5,
    });
    if (!rl.allowed) {
      return fail("RATE_LIMITED", "URL capture limit reached. You can capture 5 URLs per hour.", 429);
    }

    const screenshot = await puppeteerClient.screenshotUrl({
      url,
      width: 1440,
      fullPage: true,
      waitUntil: "networkidle2",
    });

    const meta = await sharp(screenshot).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    let visionBuf = await sharp(screenshot)
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    if (visionBuf.length > 5 * 1024 * 1024) {
      visionBuf = await sharp(screenshot)
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
    }
    const thumbBuf = await sharp(screenshot)
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

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
        originalFilename: url,
        visionUrl,
        thumbnailUrl,
      },
    });

    return ok({
      referenceId: reference.id,
      visionUrl,
      thumbnailUrl,
      thumbnailDimensions: { width, height },
    });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    return fail("INTERNAL_ERROR", "Failed to capture URL reference", 500);
  }
}

