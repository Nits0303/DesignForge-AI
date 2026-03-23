import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { isWebhookEventType } from "@/lib/webhooks/deliver";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminUser();
    const { id } = await ctx.params;
    const existing = await prisma.webhookConfig.findFirst({ where: { id, userId } });
    if (!existing) return fail("NOT_FOUND", "Webhook not found", 404);

    const body = (await req.json()) as {
      url?: string;
      secret?: string;
      events?: string[];
      isActive?: boolean;
    };
    if (body.url != null && !String(body.url).trim().startsWith("https://")) {
      return fail("VALIDATION_ERROR", "URL must use HTTPS", 400);
    }
    const events = body.events != null ? body.events.filter(isWebhookEventType) : undefined;
    if (events != null && !events.length) {
      return fail("VALIDATION_ERROR", "Select at least one event", 400);
    }

    const updated = await prisma.webhookConfig.update({
      where: { id },
      data: {
        ...(body.url != null ? { url: String(body.url).trim() } : {}),
        ...(body.secret != null ? { secret: String(body.secret) } : {}),
        ...(events != null ? { events } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
    return ok({ webhook: updated }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminUser();
    const { id } = await ctx.params;
    const existing = await prisma.webhookConfig.findFirst({ where: { id, userId } });
    if (!existing) return fail("NOT_FOUND", "Webhook not found", 404);
    await prisma.webhookConfig.delete({ where: { id } });
    return ok({ deleted: true }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
