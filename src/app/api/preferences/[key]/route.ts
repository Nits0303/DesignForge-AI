import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";
import { z } from "zod";
import { redis } from "@/lib/redis/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  preferenceValue: z.any(),
});

export async function PUT(req: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    const session = await getRequiredSession();
    const { key } = await context.params;
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const pref = await prisma.userPreference.upsert({
      where: {
        userId_preferenceKey: {
          userId: session.user.id,
          preferenceKey: key,
        },
      },
      update: {
        preferenceValue: parsed.data.preferenceValue,
        confidence: 1.0,
        sampleCount: 0,
        manualOverride: true,
      },
      create: {
        userId: session.user.id,
        preferenceKey: key,
        preferenceValue: parsed.data.preferenceValue,
        confidence: 1.0,
        sampleCount: 0,
        manualOverride: true,
      },
    });

    await redis.del(`preferences:user:${session.user.id}:prompt_block`);
    return ok(pref);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    const session = await getRequiredSession();
    const { key } = await context.params;

    // Remove manual override; next nightly inference run will restore/update.
    await prisma.userPreference.updateMany({
      where: {
        userId: session.user.id,
        preferenceKey: key,
        manualOverride: true,
      },
      data: {
        manualOverride: false,
        confidence: 0,
        sampleCount: 0,
      },
    });

    await redis.del(`preferences:user:${session.user.id}:prompt_block`);
    return ok({ removed: true });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

