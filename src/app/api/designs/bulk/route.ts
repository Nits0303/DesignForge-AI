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

export async function DELETE(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const payload = await req.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const uniqueIds = [...new Set(parsed.data.designIds)];
    const designs = await prisma.design.findMany({
      where: { userId, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (!designs.length) return ok({ deletedCount: 0 });

    const res = await prisma.design.deleteMany({
      where: { userId, id: { in: designs.map((d) => d.id) } },
    });

    await invalidateDesignCaches(userId);
    return ok({ deletedCount: res.count, designIds: designs.map((d) => d.id) });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

