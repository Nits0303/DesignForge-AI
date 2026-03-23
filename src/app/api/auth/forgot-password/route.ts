import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Invalid email"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", "Invalid email.", 400);
    }

    const { email } = parsed.data;

    // Always respond OK to avoid leaking whether an account exists.
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000").replace(/\/+$/, "");

    const resetUrl = `${baseUrl}/reset-password?email=${encodeURIComponent(
      email,
    )}&token=${token}`;

    if (process.env.NODE_ENV === "production") {
      return ok({});
    }

    return ok({ resetUrl });
  } catch (err) {
    console.error("Forgot password error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

