import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  avatarUrl: z.string().min(1).max(500).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid payload", 400);

    const data: any = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl;

    if (Object.keys(data).length === 0) return fail("VALIDATION_ERROR", "Nothing to update", 400);

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: { id: true, name: true, avatarUrl: true },
    });

    // No token update necessary with JWT strategy; client can refresh UI.
    return ok(user, 200);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

