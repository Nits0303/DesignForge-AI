import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import { AdminAbTestCreateWizard } from "@/components/admin/AdminAbTestCreateWizard";

export const runtime = "nodejs";

export default async function AdminNewAbTestPage({
  searchParams,
}: {
  searchParams: Promise<{ suggestion?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/dashboard?admin_denied=1");
  }

  const sp = await searchParams;
  const suggestionId = sp.suggestion?.trim();
  const suggestion = suggestionId
    ? await prisma.aBTestSuggestion.findUnique({ where: { id: suggestionId } })
    : null;

  const suggestionConfig =
    suggestion?.suggestedTestConfig && typeof suggestion.suggestedTestConfig === "object"
      ? (suggestion.suggestedTestConfig as Record<string, unknown>)
      : null;

  return (
    <AdminSectionErrorBoundary title="Create A/B test">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-bold">Create A/B test</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Three-step wizard: basics, variants, and MDE / power. Drafts are created via{" "}
            <code className="text-xs">POST /api/admin/ab-tests</code>.
          </p>
        </div>

        {suggestion ? (
          <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 text-sm">
            <div className="font-semibold">From suggestion {suggestion.id}</div>
            <p className="mt-2 text-[hsl(var(--muted-foreground))]">{suggestion.rationale}</p>
          </div>
        ) : null}

        <AdminAbTestCreateWizard suggestionConfig={suggestionConfig} />

        <Link href="/admin/analytics" className="text-sm text-[hsl(var(--accent))] underline">
          ← Back to admin analytics
        </Link>
      </div>
    </AdminSectionErrorBoundary>
  );
}
