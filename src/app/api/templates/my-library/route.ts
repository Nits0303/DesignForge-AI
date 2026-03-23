import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const sp = req.nextUrl.searchParams;
    const activeOnly = sp.get("activeOnly") !== "false";
    const platform = sp.get("platform") ?? undefined;
    const search = sp.get("search")?.trim();

    const rows = await prisma.templateInstallation.findMany({
      where: {
        userId: session.user.id,
        ...(activeOnly ? { isActive: true } : {}),
        template: {
          ...(platform && platform !== "all" ? { OR: [{ platform }, { platform: "all" }] } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { marketplaceDescription: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
      },
      include: { template: true },
      orderBy: { installedAt: "desc" },
    });

    return ok({ installations: rows }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
