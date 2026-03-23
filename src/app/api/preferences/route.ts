import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { NextRequest } from "next/server";
import { z } from "zod";
import { PREFERENCE_LABELS } from "@/constants/preferenceLabels";
import { redis } from "@/lib/redis/client";

const setSchema = z.object({
  preferenceKey: z.string().min(1),
  preferenceValue: z.any(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const key = req.nextUrl.searchParams.get("key");

    const baseWhere = { userId: session.user.id };
    if (key) {
      const pref = await prisma.userPreference.findUnique({
        where: { userId_preferenceKey: { userId: session.user.id, preferenceKey: key } },
      });
      if (!pref) return ok(null);
      return ok({
        ...pref,
        label: PREFERENCE_LABELS[pref.preferenceKey] ?? pref.preferenceKey,
      });
    }

    const prefs = await prisma.userPreference.findMany({
      where: baseWhere,
      orderBy: { updatedAt: "desc" },
    });

    return ok(
      prefs.map((p) => ({
        ...p,
        label: PREFERENCE_LABELS[p.preferenceKey] ?? p.preferenceKey,
      }))
    );
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401)
      return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json();
    const parsed = setSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const pref = await prisma.userPreference.upsert({
      where: {
        userId_preferenceKey: {
          userId: session.user.id,
          preferenceKey: parsed.data.preferenceKey,
        },
      },
      update: {
        preferenceValue: parsed.data.preferenceValue,
        confidence: 1.0,
        manualOverride: true,
        sampleCount: 0,
      },
      create: {
        userId: session.user.id,
        preferenceKey: parsed.data.preferenceKey,
        preferenceValue: parsed.data.preferenceValue,
        confidence: 1.0,
        manualOverride: true,
        sampleCount: 0,
      },
    });

    // Preferences block is cached for prompt assembler; invalidate to apply overrides immediately.
    await redis.del(`preferences:user:${session.user.id}:prompt_block`);
    return ok(pref, 201);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401)
      return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getRequiredSession();
    const includeManual = new URL(req.url).searchParams.get("includeManual") === "true";

    const res = await prisma.userPreference.deleteMany({
      where: {
        userId: session.user.id,
        ...(includeManual ? {} : { manualOverride: false }),
      },
    });

    // Invalidate prompt block cache so reset is reflected quickly.
    await redis.del(`preferences:user:${session.user.id}:prompt_block`);
    return ok({ deletedCount: res.count });
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401)
      return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
