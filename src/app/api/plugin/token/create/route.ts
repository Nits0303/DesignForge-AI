import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { hashPluginToken } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashPluginToken(rawToken);
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await prisma.pluginToken.create({
      data: {
        userId: session.user.id,
        tokenHash,
        name: parsed.data.name ?? "Figma Plugin",
        expiresAt,
      },
    });

    return ok({
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      message: "Copy this token now — it cannot be shown again.",
    });
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED" || e?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
