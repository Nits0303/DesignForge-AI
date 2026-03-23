import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

async function invalidateDesignListCache(userId: string) {
  try {
    const keys = await redis.keys(`designs:list:${userId}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.del(`designs:recent:${userId}`);
    await redis.del(`dashboard:stats:${userId}`);
  } catch {
    // best effort cache invalidation
  }
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id } = await context.params;

    const design = await prisma.design.findFirst({
      where: { id, userId },
      include: {
        versions: {
          orderBy: { versionNumber: "asc" },
        },
        brand: { select: { name: true } },
        project: { select: { name: true } },
      },
    });
    if (!design) {
      return fail("NOT_FOUND", "Design not found", 404);
    }
    return ok(design);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["archived"]).optional(),
  projectId: z.string().cuid().nullable().optional(),
});

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id } = await context.params;
    const payload = await req.json();
    const parsed = updateSchema.safeParse(payload);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const existing = await prisma.design.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    if (!existing) return fail("NOT_FOUND", "Design not found", 404);

    if (parsed.data.projectId !== undefined && parsed.data.projectId !== null) {
      const proj = await prisma.project.findFirst({
        where: { id: parsed.data.projectId, userId },
        select: { id: true },
      });
      if (!proj) return fail("NOT_FOUND", "Project not found", 404);
    }

    const updated = await prisma.design.update({
      where: { id },
      data: parsed.data as any,
    });

    await invalidateDesignListCache(userId);
    return ok(updated);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id } = await context.params;

    const existing = await prisma.design.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return fail("NOT_FOUND", "Design not found", 404);

    await prisma.design.delete({
      where: { id },
    });

    await invalidateDesignListCache(userId);
    return new Response(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

