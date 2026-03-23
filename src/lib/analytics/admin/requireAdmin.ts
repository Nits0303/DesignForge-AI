import { prisma } from "@/lib/db/prisma";
import { getRequiredSession } from "@/lib/auth/session";

export async function requireAdminUser(): Promise<{ userId: string }> {
  const session = await getRequiredSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isAdmin: true },
  });

  if (!user?.id || !user.isAdmin) {
    const err: any = new Error("Admin only");
    err.code = "FORBIDDEN";
    err.status = 403;
    throw err;
  }

  return { userId: user.id };
}

