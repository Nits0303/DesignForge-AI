import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

/** Recent delivery attempts for a webhook (admin). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminUser();
    const { id } = await ctx.params;
    const webhook = await prisma.webhookConfig.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!webhook) return fail("NOT_FOUND", "Webhook not found", 404);

    const deliveries = await prisma.webhookDeliveryLog.findMany({
      where: { webhookConfigId: id },
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        event: true,
        success: true,
        statusCode: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    return ok({ deliveries }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
