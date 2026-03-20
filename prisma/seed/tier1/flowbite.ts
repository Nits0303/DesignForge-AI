import { upsertTemplate } from "../helpers";

export async function seedFlowbiteTier1() {
  const templates = [
    {
      name: "flowbite-hero-center-cta",
      tier: "section",
      category: "hero",
      platform: "website",
      htmlSnippet: `
<section class="mx-auto max-w-3xl px-6 py-16 text-center">
  <p class="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--accent))]">
    New
  </p>
  <h1 class="mt-3 text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
    Ship beautiful marketing pages in minutes
  </h1>
  <p class="mt-3 text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
    Pre-built Tailwind sections that drop into your product with a single copy-paste. No design team required.
  </p>
  <div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
    <a
      href="#"
      class="inline-flex items-center justify-center rounded-md bg-[hsl(var(--accent))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent-hover))]"
    >
      Start free trial
    </a>
    <a
      href="#"
      class="inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-elevated))]/70"
    >
      View components
    </a>
  </div>
</section>`.trim(),
      previewUrl: null,
      tags: ["hero", "marketing", "cta", "website"],
      source: "flowbite",
      isActive: true,
    },
  ];

  for (const tpl of templates) {
    try {
      await upsertTemplate(tpl as any);
    } catch (err) {
      console.error("Failed to upsert flowbite template", tpl.name, err);
    }
  }
}

