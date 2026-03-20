import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const brandCount = await prisma.brandProfile.count({ where: { userId: session.user.id } });

  return (
    <DashboardShell user={session.user} hasBrands={brandCount > 0}>
      {children}
    </DashboardShell>
  );
}

