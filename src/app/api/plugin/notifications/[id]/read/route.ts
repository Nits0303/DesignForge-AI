import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await validatePluginBearer(req);
  if (!auth) return fail("UNAUTHORIZED", "Invalid or expired token", 401);

  const { id } = await ctx.params;

  const res = await prisma.notification.updateMany({
    where: { id, userId: auth.userId },
    data: { isRead: true },
  });

  if (res.count === 0) return fail("NOT_FOUND", "Notification not found", 404);
  return ok({ ok: true });
}
