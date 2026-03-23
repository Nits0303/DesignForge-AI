import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const items = await prisma.template.findMany({
      where: { contributorUserId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });
    return ok({ templates: items }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
