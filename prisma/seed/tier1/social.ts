import { upsertTemplate } from "../helpers";

export async function seedSocialTier1() {
  const templates = [
    {
      name: "social-instagram-minimal-text-post",
      tier: "atomic",
      category: "instagram-post",
      platform: "instagram",
      htmlSnippet: `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Minimal text post</title>
  </head>
  <body class="m-0 flex items-center justify-center bg-[#050816]">
    <div
      class="flex h-[1080px] w-[1080px] flex-col items-center justify-center bg-gradient-to-br from-[#1e293b] to-[#020617] px-24 text-center text-white"
      style="width: 1080px; height: 1080px; overflow: hidden;"
    >
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--accent))]">
        DESIGNFORGE AI
      </p>
      <h1 class="mt-4 text-5xl font-bold leading-tight sm:text-6xl">
        Turn rough prompts into polished layouts.
      </h1>
      <p class="mt-6 max-w-xl text-base text-white/70">
        Shortcuts for founders, marketers, and creators who need production-ready designs yesterday.
      </p>
    </div>
  </body>
</html>`.trim(),
      previewUrl: null,
      tags: ["instagram", "post", "minimal", "text"],
      source: "custom",
      isActive: true,
    },
  ];

  for (const tpl of templates) {
    try {
      await upsertTemplate(tpl as any);
    } catch (err) {
      console.error("Failed to upsert social template", tpl.name, err);
    }
  }
}

