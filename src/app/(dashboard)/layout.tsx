import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const runtime = "nodejs";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <DashboardShell user={session.user} hasBrands={true}>
      {children}
    </DashboardShell>
  );
}

