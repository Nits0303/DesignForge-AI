import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
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
      const msg = parsed.error.issues.map((e: { message: string }) => e.message).join("; ");
      return fail("VALIDATION_ERROR", msg, 400);
    }

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail("EMAIL_ALREADY_EXISTS", "An account with this email already exists.", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        authProvider: "email",
      },
    });

    return ok({ id: user.id, name: user.name, email: user.email }, 201);
  } catch (err) {
    console.error("Register error:", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
