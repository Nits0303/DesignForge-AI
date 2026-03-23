import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { AdminReviewDetailClient } from "@/components/admin/AdminReviewDetailClient";

export const runtime = "nodejs";

export default async function AdminTemplateReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) redirect("/dashboard?admin_denied=1");
  const { id } = await params;

  return (
    <AdminSectionErrorBoundary title="Review template">
      <AdminReviewDetailClient id={id} />
    </AdminSectionErrorBoundary>
  );
}
