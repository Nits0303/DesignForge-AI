import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(1),
  templateIds: z.array(z.string()).default([]),
  coverImageUrl: z.string().optional().nullable(),
  isPublic: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdminUser();
    const rows = await prisma.templateCollection.findMany({
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    return ok({ collections: rows }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminUser();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);
    const b = parsed.data;

    const row = await prisma.templateCollection.create({
      data: {
        name: b.name,
        description: b.description,
        templateIds: b.templateIds as any,
        coverImageUrl: b.coverImageUrl ?? null,
        isPublic: b.isPublic,
        createdByUserId: userId,
      },
    });
    return ok({ collection: row }, 201);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    console.error(e);
    return fail("INTERNAL_ERROR", "Create failed", 500);
  }
}
