import Link from "next/link";

export const metadata = {
  title: "Create team | DesignForge AI",
};

export default function NewTeamPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <Link href="/teams" className="text-sm text-[hsl(var(--accent))]">
        ← Teams
      </Link>
      <h1 className="text-xl font-bold">Create team</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Team creation UI is coming in the next Sprint 18 iteration. Use the API or database seed for now.
      </p>
    </div>
  );
}
