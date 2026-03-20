import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
});

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const project = await prisma.project.findFirst({ where: { id, userId }, select: { id: true } });
    if (!project) return fail("NOT_FOUND", "Project not found", 404);

    const updated = await prisma.project.update({
      where: { id },
      data: parsed.data,
    });
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

    const project = await prisma.project.findFirst({ where: { id, userId }, select: { id: true } });
    if (!project) return fail("NOT_FOUND", "Project not found", 404);

    await prisma.design.updateMany({
      where: { projectId: id, userId },
      data: { projectId: null },
    });
    await prisma.project.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

