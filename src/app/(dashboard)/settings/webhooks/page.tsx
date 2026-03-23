import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { WebhooksSettingsClient } from "./WebhooksSettingsClient";

export const runtime = "nodejs";

export default async function WebhooksSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/dashboard?admin_denied=1");
  }

  return (
    <div className="space-y-6 p-2 sm:p-4">
      <AdminSectionErrorBoundary title="Webhooks">
        <WebhooksSettingsClient />
      </AdminSectionErrorBoundary>
    </div>
  );
}
