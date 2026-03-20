import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        designs: {
          select: { id: true, title: true, platform: true, format: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 4,
        },
      },
    });
    return ok(projects);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const project = await prisma.project.create({
      data: {
        userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      },
    });
    return ok(project, 201);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

