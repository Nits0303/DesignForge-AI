import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New password and confirm password do not match",
    path: ["confirmPassword"],
  });

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join("; "), 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user?.passwordHash) return fail("NO_PASSWORD", "Password auth is not enabled for this account.", 400);

    const okPwd = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!okPwd) return fail("INVALID_PASSWORD", "Current password is incorrect.", 400);

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash, authProvider: "email" },
    });

    return ok({ success: true }, 200);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

