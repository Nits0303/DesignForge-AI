import { upsertTemplate } from "../helpers";

export async function seedDashboardTier2() {
  const templates = [
    {
      name: "dashboard-shell-layout",
      tier: "section",
      category: "layout",
      platform: "dashboard",
      htmlSnippet: `
<div class="flex min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
  <aside class="hidden w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))] md:block">
    <div class="px-4 py-4 text-sm font-semibold">DesignForge Admin</div>
    <nav class="space-y-1 px-2 py-2 text-sm text-[hsl(var(--muted-foreground))]">
      <a href="#" class="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]">
        Overview
      </a>
      <a href="#" class="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]">
        Templates
      </a>
      <a href="#" class="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]">
        Users
      </a>
    </nav>
  </aside>
  <main class="flex-1 px-4 py-4 md:px-8 md:py-6">
    <header class="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
      <h1 class="text-lg font-semibold">Dashboard</h1>
      <div class="h-8 w-8 rounded-full bg-[hsl(var(--border))]" />
    </header>
    <div class="mt-4 grid gap-4 md:grid-cols-3">
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
        <p class="text-xs text-[hsl(var(--muted-foreground))]">Templates</p>
        <p class="mt-2 text-2xl font-semibold">128</p>
      </div>
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
        <p class="text-xs text-[hsl(var(--muted-foreground))]">Active users</p>
        <p class="mt-2 text-2xl font-semibold">864</p>
      </div>
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
        <p class="text-xs text-[hsl(var(--muted-foreground))]">Generations / day</p>
        <p class="mt-2 text-2xl font-semibold">3.4k</p>
      </div>
    </div>
  </main>
</div>`.trim(),
      previewUrl: null,
      tags: ["dashboard", "layout", "admin"],
      source: "custom",
      isActive: true,
    },
  ];

  for (const tpl of templates) {
    try {
      await upsertTemplate(tpl as any);
    } catch (err) {
      console.error("Failed to upsert dashboard section template", tpl.name, err);
    }
  }
}

