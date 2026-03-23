import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

const bodySchema = z.object({
  classes: z.array(z.string().max(200)).max(500),
});

export async function POST(req: Request) {
  const auth = await validatePluginBearer(req);
  if (!auth) return fail("UNAUTHORIZED", "Invalid or expired token", 401);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

  const unique = Array.from(new Set(parsed.data.classes.map((c) => c.trim()).filter(Boolean)));
  if (!unique.length) return ok({ saved: 0 });

  await prisma.pluginFeedback.create({
    data: {
      userId: auth.userId,
      classes: unique,
    },
  });

  return ok({ saved: unique.length });
}
