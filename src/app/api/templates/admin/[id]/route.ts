import { NextRequest } from "next/server";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const window = new JSDOM("").window as any;
const purifier = DOMPurify(window);

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getRequiredSession();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return fail("FORBIDDEN", "Admin only", 403);
    }

    const body = await req.json();
    const updates: any = {};
    if (typeof body.htmlSnippet === "string") {
      updates.htmlSnippet = purifier.sanitize(body.htmlSnippet, { ADD_ATTR: ["style"] });
    }
    if (Object.keys(updates).length === 0) {
      return fail("VALIDATION_ERROR", "No fields to update", 400);
    }

    const { id } = await context.params;
    const tpl = await prisma.template.update({
      where: { id },
      data: updates,
    });

    return ok(tpl);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Authentication required", 401);
    }
    console.error("Error in PUT /api/templates/admin/[id]", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

