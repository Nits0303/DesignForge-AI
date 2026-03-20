import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const CACHE_SECONDS = 60 * 60;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await getRequiredSession();

    const { id } = await context.params;
    const cacheKey = `template:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return ok(JSON.parse(cached));
    }

    const tpl = await prisma.template.findUnique({ where: { id } });
    if (!tpl) {
      return fail("NOT_FOUND", "Template not found", 404);
    }

    await redis.set(cacheKey, JSON.stringify(tpl), "EX", CACHE_SECONDS);

    return ok(tpl);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    console.error("Error in GET /api/templates/[id]", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

