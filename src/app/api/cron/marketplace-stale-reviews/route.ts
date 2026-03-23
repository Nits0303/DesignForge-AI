import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * Resets templates stuck in under_review with no decision for > 2 hours.
 * Protect with CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return fail("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const res = await prisma.template.updateMany({
    where: {
      submissionStatus: "under_review",
      reviewClaimedAt: { lt: cutoff },
    } as any,
    data: {
      submissionStatus: "submitted",
      reviewingAdminUserId: null,
      reviewClaimedAt: null,
    } as any,
  });

  return ok({ resetCount: res.count }, 200);
}
