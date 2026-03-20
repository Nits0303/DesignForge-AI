import { upsertTemplate } from "../helpers";

export async function seedShadcnTier1() {
  const templates = [
    {
      name: "shadcn-primary-button",
      tier: "atomic",
      category: "button",
      platform: "all",
      htmlSnippet: `
<button class="inline-flex items-center justify-center rounded-md bg-[hsl(var(--accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--accent-foreground))] transition-colors hover:bg-[hsl(var(--accent-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--border-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]">
  Primary action
</button>`.trim(),
      previewUrl: null,
      tags: ["button", "cta", "primary"],
      source: "shadcn",
      isActive: true,
    },
    {
      name: "shadcn-card-basic",
      tier: "atomic",
      category: "card",
      platform: "all",
      htmlSnippet: `
<div class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
  <h3 class="text-sm font-semibold text-[hsl(var(--foreground))]">Card title</h3>
  <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
    Supporting text for this card lives here. Keep it short and scannable.
  </p>
</div>`.trim(),
      previewUrl: null,
      tags: ["card", "content"],
      source: "shadcn",
      isActive: true,
    },
    {
      name: "shadcn-alert-success",
      tier: "atomic",
      category: "alert",
      platform: "all",
      htmlSnippet: `
<div class="flex items-start gap-3 rounded-lg border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 px-3 py-2 text-sm">
  <span class="mt-0.5 h-2 w-2 rounded-full bg-[hsl(var(--success))]"></span>
  <div>
    <p class="font-semibold text-[hsl(var(--foreground))]">Saved</p>
    <p class="text-[hsl(var(--muted-foreground))]">Your changes have been saved successfully.</p>
  </div>
</div>`.trim(),
      previewUrl: null,
      tags: ["alert", "feedback", "success"],
      source: "shadcn",
      isActive: true,
    },
  ];

  for (const tpl of templates) {
    try {
      await upsertTemplate(tpl as any);
    } catch (err) {
      console.error("Failed to upsert shadcn template", tpl.name, err);
    }
  }
}

