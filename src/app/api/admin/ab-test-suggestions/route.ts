import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminUser();
    const suggestions = await prisma.aBTestSuggestion.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ suggestions }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminUser();
    const body = (await req.json()) as { id?: string; status?: string };
    const id = String(body.id ?? "");
    if (!id) return fail("VALIDATION_ERROR", "id required", 400);
    const status = String(body.status ?? "dismissed");
    const updated = await prisma.aBTestSuggestion.update({
      where: { id },
      data: { status },
    });
    return ok({ suggestion: updated }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
