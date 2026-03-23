import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { AbTestDetailCharts } from "@/components/admin/AbTestDetailCharts";
import { AdminAbTestDetailActions } from "@/components/admin/AdminAbTestDetailActions";

export const runtime = "nodejs";

export default async function AdminAbTestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/dashboard?admin_denied=1");
  }

  const test = await prisma.promptABTest.findUnique({ where: { id } });
  if (!test) notFound();

  const latestResult = await prisma.aBTestResult.findFirst({
    where: { testId: id },
    orderBy: { computedAt: "desc" },
  });

  return (
    <AdminSectionErrorBoundary title="A/B test detail">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">{test.name}</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {test.platform} / {test.format} · {test.status}
            </p>
          </div>
          <AdminAbTestDetailActions testId={test.id} status={test.status} />
        </div>

        {latestResult ? (
          <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
            <div className="text-sm font-semibold">Latest computed result</div>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              {new Date(latestResult.computedAt).toLocaleString()} · sample sufficient:{" "}
              {latestResult.sampleSufficient ? "yes" : "no"}
            </p>
            {latestResult.recommendedWinner ? (
              <p className="mt-2 text-sm">
                Recommended winner variant:{" "}
                <code className="text-[hsl(var(--accent))]">{latestResult.recommendedWinner}</code>
              </p>
            ) : (
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No winner recommended yet.</p>
            )}
            <div className="mt-4">
              <AbTestDetailCharts
                variantResults={latestResult.variantResults}
                significanceResult={latestResult.significanceResult}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No nightly results yet.</p>
        )}

        <Link href="/admin/analytics" className="text-sm text-[hsl(var(--accent))] underline">
          ← Back to admin analytics
        </Link>
      </div>
    </AdminSectionErrorBoundary>
  );
}
