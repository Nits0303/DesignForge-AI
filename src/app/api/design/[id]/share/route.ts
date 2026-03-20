import { prisma } from "@/lib/db/prisma";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";

export const runtime = "nodejs";

function generateToken(length = 32): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (const v of values) result += chars[v % chars.length];
  return result;
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const { id: designId } = await context.params;

    const design = await prisma.design.findFirst({
      where: { id: designId, userId },
      select: { id: true, shareToken: true, shareExpiry: true },
    });
    if (!design) return fail("NOT_FOUND", "Design not found", 404);

    // Reuse valid existing token
    const now = new Date();
    if (
      design.shareToken &&
      design.shareExpiry &&
      design.shareExpiry > now
    ) {
      const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/preview/${design.shareToken}`;
      return ok({ shareToken: design.shareToken, shareUrl });
    }

    // Create new token (7-day expiry)
    const shareToken = generateToken();
    const shareExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.design.update({
      where: { id: designId },
      data: { shareToken, shareExpiry },
    });

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/preview/${shareToken}`;
    return ok({ shareToken, shareUrl }, 201);
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401)
      return fail("UNAUTHORIZED", "Authentication required", 401);
    console.error("Error in POST /api/design/[id]/share", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
