import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Invalid email"),
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join("; ");
      return fail("VALIDATION_ERROR", msg, 400);
    }

    const { email, token, password } = parsed.data;
    const record = await prisma.verificationToken.findUnique({ where: { token } });

    if (!record || record.identifier !== email) {
      return fail("INVALID_TOKEN", "Invalid or expired reset token.", 400);
    }

    if (record.expires.getTime() < Date.now()) {
      return fail("TOKEN_EXPIRED", "Reset token has expired.", 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return fail("NO_USER", "No user found for this email.", 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        authProvider: "email",
        lastLoginAt: new Date(),
      },
    });

    await prisma.verificationToken.deleteMany({ where: { token } });

    return ok({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

