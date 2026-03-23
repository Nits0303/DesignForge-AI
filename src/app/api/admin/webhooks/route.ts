import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { WEBHOOK_EVENTS, isWebhookEventType } from "@/lib/webhooks/deliver";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await requireAdminUser();
    const items = await prisma.webhookConfig.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });
    return ok({ webhooks: items }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireAdminUser();
    const body = (await req.json()) as {
      url?: string;
      secret?: string;
      events?: string[];
      isActive?: boolean;
    };
    const url = String(body.url ?? "").trim();
    if (!url.startsWith("https://")) {
      return fail("VALIDATION_ERROR", "Webhook URL must use HTTPS", 400);
    }
    const secret = String(body.secret ?? process.env.WEBHOOK_SIGNING_SECRET ?? "").trim();
    if (!secret) {
      return fail("VALIDATION_ERROR", "Provide secret or set WEBHOOK_SIGNING_SECRET", 400);
    }
    const events = Array.isArray(body.events) ? body.events.filter(isWebhookEventType) : [...WEBHOOK_EVENTS];
    if (!events.length) return fail("VALIDATION_ERROR", "Select at least one event", 400);

    const row = await prisma.webhookConfig.create({
      data: {
        userId,
        url,
        secret,
        events,
        isActive: body.isActive !== false,
      },
    });
    return ok({ webhook: { id: row.id, url: row.url, events: row.events, isActive: row.isActive } }, 201);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
