import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminUser();

    const [submitted, underReview] = await Promise.all([
      prisma.template.count({ where: { submissionStatus: "submitted" } }),
      prisma.template.count({ where: { submissionStatus: "under_review" } }),
    ]);

    const rows = await prisma.template.findMany({
      where: {
        submissionStatus: { in: ["submitted", "under_review"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        contributor: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } },
      },
    });

    return ok({ items: rows, counts: { submitted, underReview } }, 200);
  } catch (e: any) {
    if (e?.code === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
