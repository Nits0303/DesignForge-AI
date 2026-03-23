import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { AdminReviewQueueClient } from "@/components/admin/AdminReviewQueueClient";

export const runtime = "nodejs";

export default async function AdminTemplateReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) redirect("/dashboard?admin_denied=1");

  return (
    <AdminSectionErrorBoundary title="Template review queue">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">Review queue</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Community template submissions (FIFO).</p>
      </div>
      <AdminReviewQueueClient />
    </AdminSectionErrorBoundary>
  );
}
