import { TeamsPageClient } from "@/components/teams/TeamsPageClient";

export const metadata = {
  title: "Teams | DesignForge AI",
};

export default function TeamsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Teams</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Shared workspaces, brands, and approvals (Sprint 18).
        </p>
      </div>
      <TeamsPageClient />
    </div>
  );
}
