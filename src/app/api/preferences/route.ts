import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { NextRequest } from "next/server";
import { z } from "zod";

const getSchema = z.object({ key: z.string().min(1) });
const postSchema = z.object({
  preferenceKey: z.string().min(1),
  preferenceValue: z.any(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const key = req.nextUrl.searchParams.get("key");
    const parsed = getSchema.safeParse({ key });
    if (!parsed.success) return fail("VALIDATION_ERROR", "key param required", 400);

    const pref = await prisma.userPreference.findUnique({
      where: { userId_preferenceKey: { userId: session.user.id, preferenceKey: parsed.data.key } },
    });

    return ok(pref ?? null);
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
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const pref = await prisma.userPreference.upsert({
      where: {
        userId_preferenceKey: {
          userId: session.user.id,
          preferenceKey: parsed.data.preferenceKey,
        },
      },
      update: { preferenceValue: parsed.data.preferenceValue },
      create: {
        userId: session.user.id,
        preferenceKey: parsed.data.preferenceKey,
        preferenceValue: parsed.data.preferenceValue,
      },
    });

    return ok(pref, 201);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401)
      return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
