import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { getStorageService } from "@/lib/storage";
import { ok, fail } from "@/lib/api/response";
import { puppeteerClient } from "@/lib/export/puppeteerClient";

export const runtime = "nodejs";

export async function GET() {
  const status: Record<string, string> = {
    app: "ok",
    db: "error",
    redis: "error",
    storage: "error",
    puppeteer: "error",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.db = "ok";
  } catch {
    status.db = "error";
  }

  try {
    await redis.ping();
    status.redis = "ok";
  } catch {
    status.redis = "error";
  }

  try {
    const storage = getStorageService();
    await storage.exists("_health");
    status.storage = "ok";
  } catch {
    status.storage = "error";
  }

  try {
    const okHealth = await puppeteerClient.checkHealth();
    status.puppeteer = okHealth ? "ok" : "error";
  } catch {
    status.puppeteer = "error";
  }

  const allOk = Object.values(status).every((v) => v === "ok");
  return allOk ? ok(status) : ok(status, 503);
}
