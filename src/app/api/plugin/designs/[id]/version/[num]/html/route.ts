import { prisma } from "@/lib/db/prisma";
import { fail } from "@/lib/api/response";
import { validatePluginBearer } from "@/lib/auth/pluginAuth";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; num: string }> }) {
  const auth = await validatePluginBearer(req);
  if (!auth) {
    return new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id, num } = await ctx.params;
  const versionNumber = Number(num);
  if (!Number.isFinite(versionNumber) || versionNumber < 1) {
    return new Response("Invalid version", { status: 400 });
  }

  const design = await prisma.design.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!design) {
    return new Response("Not found", { status: 404 });
  }

  const version = await prisma.designVersion.findUnique({
    where: { designId_versionNumber: { designId: id, versionNumber } },
    select: { htmlContent: true },
  });
  if (!version) {
    return new Response("Version not found", { status: 404 });
  }

  return new Response(version.htmlContent, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
