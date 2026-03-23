import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { TeamWorkspaceClient } from "./TeamWorkspaceClient";

export const metadata = {
  title: "Team workspace | DesignForge AI",
};

export default async function TeamWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { slug } = await params;
  const team = await prisma.team.findFirst({
    where: {
      slug,
      members: { some: { userId: session.user.id } },
    },
    select: { id: true, name: true, slug: true },
  });

  if (!team) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <Link href="/teams" className="text-sm text-[hsl(var(--accent))]">
          ← Teams
        </Link>
        <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Team not found or you are not a member.</p>
      </div>
    );
  }

  return <TeamWorkspaceClient team={team} />;
}
