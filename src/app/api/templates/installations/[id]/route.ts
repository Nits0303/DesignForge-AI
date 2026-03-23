import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const row = await prisma.templateInstallation.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!row) return fail("NOT_FOUND", "Installation not found", 404);

    const updated = await prisma.templateInstallation.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
    });
    return ok({ installation: updated }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
