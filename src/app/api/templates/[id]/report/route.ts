import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { notifyAdminsTemplateReported } from "@/lib/notifications/marketplaceNotifications";
import type { TemplateReportType } from "@prisma/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  reportType: z.enum([
    "inappropriate_content",
    "copyright_violation",
    "broken_template",
    "spam",
    "other",
  ]),
  description: z.string().min(1).max(2000),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id: templateId } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid body", 400);

    const tpl = await prisma.template.findFirst({
      where: { id: templateId, submissionStatus: "approved", isActive: true },
    });
    if (!tpl) return fail("NOT_FOUND", "Template not found", 404);

    const reporter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    await prisma.templateReport.create({
      data: {
        templateId,
        reportedByUserId: session.user.id,
        reportType: parsed.data.reportType as TemplateReportType,
        description: parsed.data.description,
      },
    });

    await notifyAdminsTemplateReported({
      templateId,
      templateName: tpl.name,
      reporterName: reporter?.name ?? reporter?.email ?? "User",
      reportType: parsed.data.reportType,
    });

    return ok({ ok: true }, 201);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Report failed", 500);
  }
}
