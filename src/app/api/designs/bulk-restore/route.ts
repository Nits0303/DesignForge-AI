import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

const schema = z.object({
  designIds: z.array(z.string().min(1)).min(1),
});

async function invalidateDesignCaches(userId: string) {
  try {
    const keys = await redis.keys(`designs:list:${userId}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.del(`designs:recent:${userId}`);
    await redis.del(`dashboard:stats:${userId}`);
  } catch {
    // best effort
  }
}

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const payload = await req.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const uniqueIds = [...new Set(parsed.data.designIds)];
    const cachedRaw = await redis.get(`designs:bulk:last:${userId}`);
    const cachedMap = (cachedRaw ? JSON.parse(cachedRaw) : {}) as Record<string, string>;

    const targets = await prisma.design.findMany({
      where: { userId, id: { in: uniqueIds } },
      select: { id: true, status: true },
    });

    const tx = targets.map((t) => {
      const restoreStatus = cachedMap[t.id] ?? "preview";
      return prisma.design.update({
        where: { id: t.id },
        data: { status: restoreStatus as any },
        select: { id: true },
      });
    });
    await prisma.$transaction(tx);

    await invalidateDesignCaches(userId);
    return ok({ restoredCount: targets.length, designIds: targets.map((t) => t.id) });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

