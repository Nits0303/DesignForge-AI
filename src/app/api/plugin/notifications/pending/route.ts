import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await validatePluginBearer(req);
  if (!auth) return fail("UNAUTHORIZED", "Invalid or expired token", 401);

  const rows = await prisma.notification.findMany({
    where: {
      userId: auth.userId,
      isRead: false,
      type: "figma_push_ready",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      metadata: true,
    },
  });

  const items = rows.map((n) => {
    const meta = (n.metadata ?? {}) as { designId?: string };
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      designId: meta.designId ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  });

  return ok({ items });
}
