import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AdminTemplatesClient } from "@/components/admin/AdminTemplatesClient";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";

export const runtime = "nodejs";

export default async function AdminTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/dashboard");
  }

  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <AdminSectionErrorBoundary title="Admin templates">
      <AdminTemplatesClient
        initialTemplates={templates.map((t) => ({
          ...t,
          updatedAt: t.updatedAt.toISOString(),
        }))}
      />
    </AdminSectionErrorBoundary>
  );
}

