import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { emitDesignForgeWebhook } from "@/lib/webhooks/deliver";
import { promoteAbTestWinner, checkPromotionConflict } from "@/lib/learning/abTestPromoter";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await ctx.params;
    const test = await prisma.promptABTest.findUnique({
      where: { id },
      include: {
        abResults: { orderBy: { computedAt: "desc" }, take: 30 },
        promotions: { orderBy: { promotedAt: "desc" }, take: 30 },
      },
    });
    if (!test) return fail("NOT_FOUND", "Test not found", 404);
    return ok({ test }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      action?: string;
      winnerVariantId?: string;
      note?: string;
      forcePromoteDespiteConflict?: boolean;
    };
    const action = String(body.action ?? "").toLowerCase();
    const test = await prisma.promptABTest.findUnique({ where: { id } });
    if (!test) return fail("NOT_FOUND", "Test not found", 404);

    const now = new Date();

    if (action === "pause") {
      const updated = await prisma.promptABTest.update({
        where: { id },
        data: { status: "paused" },
      });
      return ok({ test: updated }, 200);
    }
    if (action === "resume") {
      const updated = await prisma.promptABTest.update({
        where: { id },
        data: { status: "running" },
      });
      return ok({ test: updated }, 200);
    }
    if (action === "launch") {
      if (test.status !== "draft" && test.status !== "paused") {
        return fail("VALIDATION_ERROR", "Can only launch draft or paused tests", 400);
      }
      const updated = await prisma.promptABTest.update({
        where: { id },
        data: { status: "running", startDate: now },
      });
      emitDesignForgeWebhook("test.started", {
        testId: id,
        testName: test.name,
        platform: test.platform,
        format: test.format,
      });
      return ok({ test: updated }, 200);
    }
    if (action === "cancel") {
      const updated = await prisma.promptABTest.update({
        where: { id },
        data: { status: "cancelled", endDate: now },
      });
      emitDesignForgeWebhook("test.completed", {
        testId: id,
        testName: test.name,
        platform: test.platform,
        format: test.format,
        reason: "cancelled",
      });
      return ok({ test: updated }, 200);
    }
    if (action === "force_conclude") {
      const winnerVariantId = String(body.winnerVariantId ?? "").trim();
      if (!winnerVariantId) return fail("VALIDATION_ERROR", "winnerVariantId required", 400);

      if (!body.forcePromoteDespiteConflict) {
        const conflict = await checkPromotionConflict(test.platform, test.format, 24);
        if (conflict) {
          return fail(
            "PROMOTION_CONFLICT",
            `Another promotion for ${test.platform}/${test.format} occurred within 24h. Pass forcePromoteDespiteConflict to proceed.`,
            409
          );
        }
      }

      const updated = await prisma.promptABTest.update({
        where: { id },
        data: {
          status: "completed",
          endDate: now,
          winnerVariantId,
          winnerConfidence: 1,
        },
      });
      try {
        await promoteAbTestWinner({ testId: id, winnerVariantId, promotedByUserId: userId });
      } catch (e) {
        console.error("[force_conclude] promote", e);
      }
      emitDesignForgeWebhook("test.completed", {
        testId: id,
        testName: test.name,
        platform: test.platform,
        format: test.format,
        winnerVariantId,
        note: body.note ?? null,
      });
      return ok({ test: updated }, 200);
    }

    return fail("VALIDATION_ERROR", "Unknown action", 400);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    if (err?.message?.includes("PROMOTION")) return fail("PROMOTION_CONFLICT", err.message, 409);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
