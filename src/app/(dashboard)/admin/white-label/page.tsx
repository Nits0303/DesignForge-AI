import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { WhiteLabelAdminClient } from "./WhiteLabelAdminClient";

export const metadata = {
  title: "White-label | Admin | DesignForge AI",
};

export const runtime = "nodejs";

export default async function WhiteLabelAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
  if (!user?.isAdmin) redirect("/dashboard?admin_denied=1");

  return <WhiteLabelAdminClient />;
}
