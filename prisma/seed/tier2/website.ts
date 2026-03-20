import { upsertTemplate } from "../helpers";

export async function seedWebsiteTier2() {
  const templates = [
    {
      name: "website-hero-saas-email-capture",
      tier: "section",
      category: "hero",
      platform: "website",
      htmlSnippet: `
<section class="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-center">
  <div class="flex-1">
    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--accent))]">
      AI-POWERED LAYOUTS
    </p>
    <h1 class="mt-3 text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl lg:text-5xl">
      From idea to production-ready design in minutes.
    </h1>
    <p class="mt-4 text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
      DesignForge AI turns plain language into pixel-perfect, brand-safe layouts for every channel.
    </p>
    <form class="mt-6 flex flex-col gap-3 sm:flex-row">
      <div class="relative flex-1">
        <input
          type="email"
          placeholder="you@example.com"
          class="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-accent))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--border-accent))]"
        />
      </div>
      <button
        type="submit"
        class="inline-flex items-center justify-center rounded-md bg-[hsl(var(--accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent-hover))]"
      >
        Join waitlist
      </button>
    </form>
  </div>
  <div class="flex-1">
    <div class="relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div class="h-40 rounded-md bg-gradient-to-br from-[hsl(var(--accent))]/40 via-transparent to-[hsl(var(--accent))]/10" />
      <p class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
        Live preview of generated layout
      </p>
    </div>
  </div>
</section>`.trim(),
      previewUrl: null,
      tags: ["hero", "website", "saas", "email", "cta"],
      source: "custom",
      isActive: true,
    },
  ];

  for (const tpl of templates) {
    try {
      await upsertTemplate(tpl as any);
    } catch (err) {
      console.error("Failed to upsert website section template", tpl.name, err);
    }
  }
}

