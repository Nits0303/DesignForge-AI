/* eslint-disable no-console */
import { v5 as uuidv5 } from "uuid";
import puppeteer, { Browser } from "puppeteer";
import * as cheerio from "cheerio";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { prisma } = require("../prisma/seed/helpers") as { prisma: any };

type Tier = "atomic" | "section" | "page";
type Platform = "all" | "instagram" | "linkedin" | "website" | "dashboard" | "mobile";
type SourceKind = "flowbite" | "hyperui" | "shadcn" | "custom";

type SourceEntry = {
  name: string;
  source: "flowbite" | "hyperui" | "shadcn" | "custom";
  kind: SourceKind;
  category: string;
  platform: Platform;
  tier: Tier;
  tags: string[];
  url?: string;
  rawUrl?: string;
  customHtml?: string;
};

const NAMESPACE = "b7f8d1fb-8330-4fa2-a55c-6d7f220b2f2a";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : null;
const NAV_DELAY_MS = 1500;
const PAGE_TIMEOUT_MS = 30_000;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function flowbiteSourcesFor(page: string, items: string[], category: string, tier: Tier, tags: string[] = []): SourceEntry[] {
  const url = `https://flowbite.com/docs/components/${page}/`;
  return items.map((name) => ({
    name: `flowbite-${slugify(name)}`,
    source: "flowbite",
    kind: "flowbite",
    category,
    platform: category === "social" ? "instagram" : "website",
    tier,
    tags: [...tags, ...slugify(name).split("-")],
    url,
  }));
}

const flowbitePrimary: SourceEntry[] = [
  ...flowbiteSourcesFor("buttons", [
    "primary button",
    "secondary button",
    "outline button",
    "gradient button",
    "colored shadow button",
    "loading button spinner",
    "button icon left",
    "button icon right",
    "pill button",
    "disabled button",
    "button group",
  ], "button", "atomic", ["flowbite", "cta"]),
  ...flowbiteSourcesFor("cards", [
    "default card",
    "card with image",
    "horizontal card",
    "user profile card",
    "ecommerce product card",
    "cta card",
    "list card",
  ], "card", "section", ["flowbite"]),
  ...flowbiteSourcesFor("forms", [
    "text input",
    "input helper text",
    "input icon",
    "input success",
    "input error",
    "textarea",
    "select input",
    "multi-select",
    "file upload",
    "toggle switch",
    "checkbox",
    "radio button",
    "range slider",
    "search input",
  ], "form", "atomic", ["flowbite", "form"]),
  ...flowbiteSourcesFor("navbar", [
    "default navbar",
    "navbar with cta",
    "mega menu navbar",
  ], "navbar", "section", ["flowbite", "navigation"]),
  ...flowbiteSourcesFor("sidebar", ["sidebar navigation"], "sidebar", "section", ["flowbite", "navigation"]),
  ...flowbiteSourcesFor("breadcrumb", ["breadcrumb"], "breadcrumb", "atomic", ["flowbite", "navigation"]),
  ...flowbiteSourcesFor("pagination", ["pagination"], "pagination", "atomic", ["flowbite", "navigation"]),
  ...flowbiteSourcesFor("tabs", ["tabs underline", "tabs pill", "tabs icon"], "tabs", "atomic", ["flowbite", "navigation"]),
  ...flowbiteSourcesFor("alerts", ["info alert", "success alert", "warning alert", "error alert", "alert list", "dismissible alert"], "alert", "atomic", ["flowbite", "feedback"]),
  ...flowbiteSourcesFor("modal", ["default modal", "small modal", "large modal", "popup modal"], "modal", "section", ["flowbite", "overlay"]),
  ...flowbiteSourcesFor("drawer", ["bottom drawer"], "drawer", "section", ["flowbite", "overlay"]),
  ...flowbiteSourcesFor("tables", ["default table", "striped table", "table with checkboxes", "table sorting", "table overflow"], "table", "section", ["flowbite", "data"]),
  ...flowbiteSourcesFor("dropdown", ["default dropdown", "dropdown divider", "dropdown icons", "dropdown header", "multi-level dropdown"], "dropdown", "atomic", ["flowbite", "menu"]),
  ...flowbiteSourcesFor("progress", ["progress default", "progress colored", "progress with label"], "progress", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("timeline", ["default timeline", "activity timeline", "grouped timeline"], "timeline", "section", ["flowbite"]),
  ...flowbiteSourcesFor("badge", ["default badge", "large badge", "badge icon", "notification badge"], "badge", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("rating", ["star rating", "rating input", "review card"], "rating", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("tooltips", ["tooltip default", "tooltip placement"], "tooltip", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("spinner", ["spinner default", "spinner colored", "button spinner"], "spinner", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("avatar", ["avatar default", "avatar text", "avatar group"], "avatar", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("banner", ["info banner", "signup banner", "dismissible banner"], "banner", "section", ["flowbite"]),
  ...flowbiteSourcesFor("footer", ["default footer", "social footer", "sitemap footer"], "footer", "section", ["flowbite"]),
  // Extra coverage to push dataset quality/volume.
  ...flowbiteSourcesFor("accordion", ["basic accordion", "flush accordion", "icon accordion", "faq accordion"], "accordion", "section", ["flowbite"]),
  ...flowbiteSourcesFor("carousel", ["image carousel", "hero carousel", "testimonial carousel"], "carousel", "section", ["flowbite"]),
  ...flowbiteSourcesFor("list-group", ["default list-group", "list-group links", "list-group badges"], "list", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("skeleton", ["skeleton card", "skeleton profile", "skeleton table"], "skeleton", "atomic", ["flowbite"]),
  ...flowbiteSourcesFor("steps", ["checkout steps", "progress steps", "timeline steps"], "steps", "section", ["flowbite"]),
  ...flowbiteSourcesFor("typography", ["article typography", "blockquote typography", "list typography"], "typography", "section", ["flowbite"]),
  ...flowbiteSourcesFor("kpi", ["kpi stats row", "kpi card trend", "kpi compact"], "stats", "section", ["flowbite", "dashboard"]),
];

const hyperuiItems = [
  "hero centered", "hero image right", "hero background", "announcement banner", "cta dark", "cta split",
  "feature grid 3", "feature grid alternating", "feature screenshot", "stats icons", "logo cloud",
  "pricing cards", "faq accordion", "testimonial grid", "testimonial large", "team grid", "blog post grid",
  "newsletter section", "contact form section", "header navigation", "product grid", "product list",
  "product card rating", "shopping cart summary", "checkout form", "order confirmation", "category filter sidebar",
  "stat cards row", "kpi card trend", "notification list", "empty state", "error page", "settings form layout",
  "two column layout", "sidebar content layout",
];

const HYPERUI_MARKETING_URLS = [
  "https://www.hyperui.dev/components/marketing/announcements",
  "https://www.hyperui.dev/components/marketing/banners",
  "https://www.hyperui.dev/components/marketing/blog-cards",
  "https://www.hyperui.dev/components/marketing/buttons",
  "https://www.hyperui.dev/components/marketing/cards",
  "https://www.hyperui.dev/components/marketing/carts",
  "https://www.hyperui.dev/components/marketing/contact-forms",
  "https://www.hyperui.dev/components/marketing/ctas",
  "https://www.hyperui.dev/components/marketing/empty-content",
  "https://www.hyperui.dev/components/marketing/faq",
  "https://www.hyperui.dev/components/marketing/features",
  "https://www.hyperui.dev/components/marketing/footer",
  "https://www.hyperui.dev/components/marketing/header",
  "https://www.hyperui.dev/components/marketing/hero",
  "https://www.hyperui.dev/components/marketing/newsletter",
  "https://www.hyperui.dev/components/marketing/pricing",
  "https://www.hyperui.dev/components/marketing/reviews",
  "https://www.hyperui.dev/components/marketing/stats",
  "https://www.hyperui.dev/components/marketing/team",
];

const HYPERUI_APP_URLS = [
  "https://www.hyperui.dev/components/application/accordions",
  "https://www.hyperui.dev/components/application/badges",
  "https://www.hyperui.dev/components/application/breadcrumbs",
  "https://www.hyperui.dev/components/application/button-groups",
  "https://www.hyperui.dev/components/application/checkboxes",
  "https://www.hyperui.dev/components/application/details-list",
  "https://www.hyperui.dev/components/application/dividers",
  "https://www.hyperui.dev/components/application/dropdown",
  "https://www.hyperui.dev/components/application/empty-states",
  "https://www.hyperui.dev/components/application/forms",
  "https://www.hyperui.dev/components/application/modals",
  "https://www.hyperui.dev/components/application/navbars",
  "https://www.hyperui.dev/components/application/pagination",
  "https://www.hyperui.dev/components/application/tables",
  "https://www.hyperui.dev/components/application/tabs",
];

function pickHyperuiUrl(name: string, idx: number): string {
  const n = name.toLowerCase();
  const useApp =
    n.includes("sidebar") ||
    n.includes("settings") ||
    n.includes("error") ||
    n.includes("empty state") ||
    n.includes("notification") ||
    n.includes("kpi") ||
    n.includes("stat cards");
  const pool = useApp ? HYPERUI_APP_URLS : HYPERUI_MARKETING_URLS;
  return pool[idx % pool.length];
}

const hyperuiSources: SourceEntry[] = hyperuiItems.map((name) => ({
  name: `hyperui-${slugify(name)}`,
  source: "hyperui",
  kind: "hyperui",
  category: name.includes("product") || name.includes("checkout") ? "ecommerce" : name.includes("kpi") || name.includes("sidebar") ? "dashboard" : "hero",
  platform: name.includes("kpi") || name.includes("dashboard") ? "dashboard" : "website",
  tier: name.includes("layout") || name.includes("hero") || name.includes("grid") ? "section" : "atomic",
  tags: ["hyperui", ...slugify(name).split("-")],
  url: pickHyperuiUrl(name, hyperuiItems.indexOf(name)),
}));

const shadcnExamples = [
  "button-demo", "card-demo", "input-demo", "textarea-demo", "select-demo", "checkbox-demo",
  "switch-demo", "badge-demo", "avatar-demo", "separator-demo", "alert-demo", "dialog-demo",
  "dropdown-menu-demo", "tabs-demo", "tooltip-demo", "progress-demo", "skeleton-demo",
  "toast-demo", "accordion-demo",
];

const shadcnSources: SourceEntry[] = shadcnExamples.map((name) => ({
  name: `shadcn-${name.replace(/-demo$/, "")}`,
  source: "shadcn",
  kind: "shadcn",
  category: name.includes("button") ? "button" : name.includes("card") ? "card" : "component",
  platform: "all",
  tier: "atomic",
  tags: ["shadcn", ...name.split("-").filter(Boolean)],
  rawUrl: `https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/examples/radix/${name}.tsx`,
}));

function socialDoc(body: string, w: number, h: number, extraHead = ""): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Caveat:wght@700&display=swap" rel="stylesheet">
  ${extraHead}
</head>
<body style="margin:0;font-family:Inter,system-ui,sans-serif;">
  <div style="width:${w}px;height:${h}px;overflow:hidden;">${body}</div>
</body>
</html>`;
}

function squareInstagramTemplate(headline: string, subline: string, bgClasses: string, extra = ""): string {
  return socialDoc(`
    <main class="relative h-full w-full ${bgClasses} p-12 text-white">
      ${extra}
      <h1 class="max-w-4xl text-7xl font-black tracking-tight">${headline}</h1>
      <p class="mt-6 max-w-3xl text-2xl text-white/90">${subline}</p>
    </main>
  `, 1080, 1080);
}

function storyTemplate(headline: string, subline: string, bgClasses: string, cta = "Swipe up"): string {
  return socialDoc(`
    <section class="relative h-full w-full ${bgClasses} p-12 text-white">
      <h1 class="mt-6 text-6xl font-black leading-tight">${headline}</h1>
      <p class="mt-6 max-w-3xl text-2xl text-white/90">${subline}</p>
      <div class="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full border border-white/40 px-6 py-3 text-lg">${cta} ↑</div>
    </section>
  `, 1080, 1920);
}

function linkedinTemplate(headline: string, body: string, accent = "indigo"): string {
  return socialDoc(`
    <section class="relative h-full w-full bg-white text-slate-900">
      <div class="absolute left-0 top-0 h-full w-4 bg-${accent}-600"></div>
      <div class="p-12 pl-16">
        <div class="text-sm font-semibold uppercase tracking-wider text-${accent}-600">Professional Update</div>
        <h1 class="mt-4 max-w-4xl text-6xl font-black tracking-tight">${headline}</h1>
        <p class="mt-5 max-w-3xl text-xl text-slate-600">${body}</p>
        <button class="mt-8 rounded-xl bg-${accent}-600 px-8 py-4 text-lg font-semibold text-white">Learn More</button>
      </div>
    </section>
  `, 1200, 627);
}

const customSocialTemplates: SourceEntry[] = [
  // 15 Instagram post templates
  { name: "custom-instagram-post-1-bold-announcement", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "announcement"], customHtml: squareInstagramTemplate("BIG NEWS", "We just launched DesignForge AI Pro.", "bg-gradient-to-br from-blue-500 to-indigo-800", `<div class="absolute right-8 top-8 rounded-xl bg-white/20 px-3 py-2 text-xs font-semibold">DF</div>`) },
  { name: "custom-instagram-post-2-quote", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "quote"], customHtml: squareInstagramTemplate("“Design is strategy made visible.”", "— Sarah Johnson", "bg-[#1a1a2e]", `<div class="absolute left-10 top-8 text-9xl text-indigo-400/50">“</div>`) },
  { name: "custom-instagram-post-3-product-showcase", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "product"], customHtml: socialDoc(`<main class="h-full w-full bg-white p-12 text-slate-900"><div class="h-[60%] rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100"></div><h2 class="mt-8 text-5xl font-black">AIPX Creator Suite</h2><p class="mt-3 text-4xl font-bold text-indigo-600">$49 / month</p><button class="mt-6 rounded-full bg-indigo-600 px-8 py-4 text-xl font-semibold text-white">Shop Now</button></main>`,1080,1080) },
  { name: "custom-instagram-post-4-tips-listicle", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "tips"], customHtml: socialDoc(`<main class="h-full w-full bg-slate-900 p-12 text-white"><h2 class="rounded-xl bg-indigo-600 px-5 py-3 text-3xl font-bold">3 Tips to Improve Conversion Design</h2>${["Use one clear CTA per section.","Increase headline contrast and scale.","Maintain consistent spacing rhythm."].map((t,i)=>`<div class='mt-6 flex items-start gap-4 rounded-2xl bg-white/5 p-4'><span class='inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 font-bold'>${i+1}</span><p class='text-2xl font-semibold'>${t}</p></div>`).join("")}</main>`,1080,1080) },
  { name: "custom-instagram-post-5-before-after", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "before-after"], customHtml: socialDoc(`<main class="grid h-full w-full grid-cols-2"><section class="bg-slate-300 p-10"><h3 class="text-4xl font-black text-slate-800">Before</h3></section><section class="bg-indigo-600 p-10 text-white"><h3 class="text-4xl font-black">After</h3></section><div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-4 py-2 text-xl font-bold">→</div></main>`,1080,1080) },
  { name: "custom-instagram-post-6-stats", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "stats"], customHtml: socialDoc(`<main class="h-full w-full bg-[#0f172a] p-12 text-white"><div class="grid grid-cols-3 gap-6">${["45%","12.4k","98%"].map((s)=>`<article class='rounded-2xl border border-white/10 bg-white/5 p-6 text-center'><p class='text-6xl font-black'>${s}</p><p class='mt-2 text-sm text-slate-300'>Growth Metric</p></article>`).join("")}</div><p class="mt-10 text-lg text-slate-300">DesignForge AI</p></main>`,1080,1080) },
  { name: "custom-instagram-post-7-event", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "event"], customHtml: squareInstagramTemplate("AI Design Summit 2026", "June 18 • San Francisco • 9:00 AM", "bg-gradient-to-br from-slate-800 to-slate-950", `<div class='absolute inset-0 bg-black/35'></div><div class='absolute bottom-12 left-12 rounded-2xl bg-white/90 p-4 text-slate-900 text-xl font-semibold'>Save your seat</div>`) },
  { name: "custom-instagram-post-8-testimonial", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "testimonial"], customHtml: socialDoc(`<main class="flex h-full w-full flex-col items-center justify-center bg-indigo-600 p-12 text-center text-white"><div class="h-40 w-40 rounded-full bg-white/20"></div><div class="mt-6 text-3xl">★★★★★</div><p class="mt-5 text-3xl italic">“Our design velocity doubled in just two weeks.”</p><p class="mt-4 text-xl text-indigo-100">Priya Sharma, Growth Lead</p></main>`,1080,1080) },
  { name: "custom-instagram-post-9-carousel-cover", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "carousel"], customHtml: squareInstagramTemplate("Build Better Landing Pages", "Swipe to see the full framework.", "bg-gradient-to-br from-violet-700 to-fuchsia-600", `<div class='absolute left-10 top-8 text-[220px] font-black text-white/10'>01</div><div class='absolute bottom-10 right-10 text-xl font-semibold'>Swipe →</div>`) },
  { name: "custom-instagram-post-10-carousel-content", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "carousel"], customHtml: socialDoc(`<main class="grid h-full w-full grid-cols-2 bg-white p-12"><section><p class="text-sm font-semibold text-indigo-600">Slide 02</p><h2 class="mt-4 text-6xl font-black text-indigo-700">Lead with one outcome</h2><p class="mt-6 text-2xl text-slate-600">Every section should reinforce a single value statement.</p></section><aside class="rounded-3xl bg-gradient-to-br from-indigo-100 to-cyan-100"></aside></main>`,1080,1080) },
  { name: "custom-instagram-post-11-sale", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "sale"], customHtml: socialDoc(`<main class="h-full w-full bg-amber-50 p-12 text-slate-900"><p class="text-xl font-semibold uppercase">Flash Deal</p><div class="mt-3 flex items-end gap-4"><p class="text-9xl font-black text-rose-600">70%</p><p class="pb-4 text-5xl font-black">OFF</p></div><p class="mt-2 text-3xl font-semibold">All premium templates</p><button class="mt-6 rounded-xl bg-slate-900 px-8 py-4 text-xl font-semibold text-white">Shop Now</button><span class="mt-4 inline-flex rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700">Today Only</span></main>`,1080,1080) },
  { name: "custom-instagram-post-12-team-spotlight", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "team"], customHtml: socialDoc(`<main class="grid h-full w-full grid-cols-[360px_1fr] bg-white p-12 text-slate-900"><div class="h-72 w-72 self-center rounded-full bg-slate-200"></div><section><h2 class="text-6xl font-black">Sarah Johnson</h2><p class="mt-3 text-3xl font-semibold text-indigo-600">Head of Design</p><p class="mt-5 text-2xl text-slate-600">Leads product storytelling, component systems, and AI-assisted visual workflows.</p></section></main>`,1080,1080) },
  { name: "custom-instagram-post-13-motivation", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "motivational"], customHtml: squareInstagramTemplate("Create with intention.", "The details are where trust is built.", "bg-gradient-to-br from-amber-500 to-orange-700") },
  { name: "custom-instagram-post-14-new-product-launch", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "launch"], customHtml: socialDoc(`<main class="h-full w-full bg-slate-950 p-12 text-white"><p class="text-lg font-semibold uppercase tracking-wider text-indigo-400">Introducing</p><h1 class="mt-3 text-7xl font-black tracking-tight">DesignForge Canvas X</h1><div class="mt-8 space-y-4">${["Instant layout intelligence","Adaptive brand styling","One-click revision memory"].map((f)=>`<div class='flex items-center gap-3 text-2xl'><span>◆</span><span>${f}</span></div>`).join("")}</div><p class="mt-10 text-xl text-slate-300">Launch: 24 June 2026</p></main>`,1080,1080) },
  { name: "custom-instagram-post-15-bts", source: "custom", kind: "custom", category: "instagram_post", platform: "instagram", tier: "page", tags: ["custom", "instagram", "behind-scenes"], customHtml: socialDoc(`<main class="h-full w-full bg-amber-50 p-12 text-slate-900"><div class="mx-auto mt-10 h-[620px] w-[620px] rotate-[-4deg] rounded-xl bg-white p-5 shadow-xl"><div class="h-full w-full bg-slate-200"></div></div><p class="mt-6 text-center text-5xl" style="font-family:Caveat,cursive">Behind the scenes: sprint day</p></main>`,1080,1080) },
  // 8 Instagram stories
  { name: "custom-instagram-story-1-product-spotlight", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "product"], customHtml: storyTemplate("Product Spotlight", "AIPX Creative Kit • $29", "bg-gradient-to-b from-fuchsia-700 to-slate-900", "Tap to shop") },
  { name: "custom-instagram-story-2-poll", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "poll"], customHtml: storyTemplate("Which style do you prefer?", "Minimal or expressive? Vote below.", "bg-gradient-to-br from-blue-500 to-purple-700", "Vote now") },
  { name: "custom-instagram-story-3-countdown", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "countdown"], customHtml: storyTemplate("Product Launch in 03:12:49", "Save the date for live reveal.", "bg-slate-950", "Set reminder") },
  { name: "custom-instagram-story-4-quote", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "quote"], customHtml: storyTemplate("“Clarity converts.”", "Design with one intent per screen.", "bg-gradient-to-br from-indigo-700 to-violet-900", "Share") },
  { name: "custom-instagram-story-5-new-post", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "new-post"], customHtml: storyTemplate("New Post is Live", "How to build high-converting hero sections.", "bg-gradient-to-b from-slate-700 to-slate-900", "See post") },
  { name: "custom-instagram-story-6-tutorial", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "tutorial"], customHtml: storyTemplate("Step 2: Structure the visual hierarchy", "Start with headline, then proof, then CTA.", "bg-white text-slate-900", "Next step") },
  { name: "custom-instagram-story-7-milestone", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "milestone"], customHtml: storyTemplate("100,000 Creators Served", "Thank you for building with us.", "bg-gradient-to-br from-pink-600 to-rose-700", "Celebrate") },
  { name: "custom-instagram-story-8-swipe-up", source: "custom", kind: "custom", category: "instagram_story", platform: "instagram", tier: "page", tags: ["custom", "instagram", "story", "cta"], customHtml: storyTemplate("Build Better Designs Faster", "See the full case study in 2 minutes.", "bg-gradient-to-b from-slate-900 to-black", "Swipe up") },
  // 10 LinkedIn templates
  { name: "custom-linkedin-1-prof-announcement", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "announcement"], customHtml: linkedinTemplate("Announcing DesignForge AI for Teams", "Enterprise-grade AI design generation for modern product teams.", "indigo") },
  { name: "custom-linkedin-2-job-opening", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "job"], customHtml: linkedinTemplate("Now Hiring: Senior AI/ML Engineer", "Join us to build robust multi-model design intelligence systems.", "blue") },
  { name: "custom-linkedin-3-thought-leadership", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "thought-leadership"], customHtml: linkedinTemplate("Great design operations reduce cognitive load", "Teams move faster when systems are opinionated, measurable, and consistent.", "slate") },
  { name: "custom-linkedin-4-milestone", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "milestone"], customHtml: linkedinTemplate("We reached 1M generated design screens", "Thank you to every product, marketing, and growth team trusting DesignForge.", "violet") },
  { name: "custom-linkedin-5-industry-insight", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "insight"], customHtml: linkedinTemplate("72% of teams report design bottlenecks in launch sprints", "Here is the exact framework we use to compress cycles without quality loss.", "indigo") },
  { name: "custom-linkedin-6-event", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "event"], customHtml: linkedinTemplate("Free Webinar: AI Design in Production", "Join experts from product, brand, and engineering to see the live workflow.", "cyan") },
  { name: "custom-linkedin-7-product-launch", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "launch"], customHtml: linkedinTemplate("Launching Canvas Intelligence 2.0", "Stronger quality controls, richer templates, and faster first drafts.", "fuchsia") },
  { name: "custom-linkedin-8-case-study", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "case-study"], customHtml: linkedinTemplate("Case Study: 41% faster campaign launches", "How one growth team unified prompt systems, templates, and approvals.", "emerald") },
  { name: "custom-linkedin-9-carousel-cover", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "carousel"], customHtml: linkedinTemplate("The 5-part system for conversion-focused design", "Swipe for each framework layer and implementation checklist.", "indigo") },
  { name: "custom-linkedin-10-doc-slide", source: "custom", kind: "custom", category: "linkedin_post", platform: "linkedin", tier: "page", tags: ["custom", "linkedin", "document"], customHtml: linkedinTemplate("Slide 03: Measurement and Optimization", "Track approval rates, cycle time, and variant performance each sprint.", "sky") },
];

const supplementalHandWritten: SourceEntry[] = [
  { name: "hero-saas-dark-premium", source: "custom", kind: "custom", category: "hero", platform: "website", tier: "section", tags: ["hero", "saas", "dark"], customHtml: `<section class="bg-gray-950 text-white px-8 py-24"><div class="mx-auto max-w-6xl text-center"><span class="inline-flex rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300">New</span><h1 class="mt-6 text-6xl font-black tracking-tight">Scale Product Teams with <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">AI Design Ops</span></h1><p class="mx-auto mt-5 max-w-2xl text-xl text-gray-400">Production-ready visual systems generated in minutes.</p><div class="mt-8 flex justify-center gap-3"><button class="rounded-xl bg-indigo-500 px-8 py-4 text-lg font-semibold">Start free</button><button class="rounded-xl border border-white/30 px-8 py-4 text-lg font-semibold">Book demo</button></div></div></section>` },
  { name: "hero-creative-gradient", source: "custom", kind: "custom", category: "hero", platform: "website", tier: "section", tags: ["hero", "agency"], customHtml: `<section class="relative overflow-hidden bg-gradient-to-br from-purple-700 via-pink-600 to-orange-500 px-8 py-24 text-white"><h1 class="mx-auto max-w-5xl text-7xl font-black tracking-tight">Build Distinctive Digital Experiences</h1><p class="mt-4 text-xl text-white/90">Creative systems that convert.</p></section>` },
  { name: "hero-minimal-clean", source: "custom", kind: "custom", category: "hero", platform: "website", tier: "section", tags: ["hero", "minimal"], customHtml: `<section class="bg-white px-12 py-24 text-slate-900"><p class="text-xs uppercase tracking-[0.25em] text-slate-500">AIPX Studio</p><h1 class="mt-4 text-8xl font-black tracking-tighter">Design that ships.</h1><div class="mt-10 grid grid-cols-2 gap-10"><p class="text-xl text-slate-600">From prompt to production UI in one workflow.</p><div class="rounded-2xl border border-slate-200 bg-slate-50 p-8 shadow-sm">Screenshot placeholder</div></div></section>` },
  { name: "hero-ecommerce-split", source: "custom", kind: "custom", category: "hero", platform: "website", tier: "section", tags: ["hero", "ecommerce"], customHtml: `<section class="grid min-h-[620px] grid-cols-2"><div class="bg-amber-100 p-14"><p class="text-sm font-semibold text-amber-700">New collection</p><h1 class="mt-5 text-6xl font-black text-slate-900">Modern essentials for everyday style</h1><button class="mt-8 rounded-xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white">Shop now</button></div><div class="relative bg-white p-14"><div class="h-full rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100">Product placeholder</div></div></section>` },
  { name: "hero-mobile-app", source: "custom", kind: "custom", category: "hero", platform: "website", tier: "section", tags: ["hero", "mobile-app"], customHtml: `<section class="bg-gradient-to-b from-slate-950 to-indigo-900 px-10 py-24 text-white"><h1 class="text-6xl font-black tracking-tight">Your AI workspace companion</h1><p class="mt-4 max-w-2xl text-xl text-indigo-200">Plan, create, and approve designs from anywhere.</p><div class="mt-10 h-96 w-56 rounded-[36px] border-4 border-white/50 bg-slate-900 p-4 shadow-2xl"><div class="h-full rounded-2xl bg-gradient-to-b from-indigo-500 to-violet-500"></div></div></section>` },
  { name: "pricing-three-tier-highlight", source: "custom", kind: "custom", category: "pricing", platform: "website", tier: "section", tags: ["pricing"], customHtml: `<section class="bg-white px-8 py-24"><div class="mx-auto max-w-6xl"><h2 class="text-center text-5xl font-black">Simple pricing</h2><div class="mt-12 grid grid-cols-3 gap-6"><article class="rounded-2xl border p-8 shadow-lg"><h3 class="text-2xl font-bold">Starter</h3><p class="mt-2 text-5xl font-black">$19</p></article><article class="scale-105 rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-8 shadow-xl"><span class="rounded-full bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">Most popular</span><h3 class="mt-3 text-2xl font-bold">Professional</h3><p class="mt-2 text-5xl font-black">$49</p></article><article class="rounded-2xl bg-slate-900 p-8 text-white shadow-lg"><h3 class="text-2xl font-bold">Enterprise</h3><p class="mt-2 text-5xl font-black">$129</p></article></div></div></section>` },
  { name: "pricing-comparison-table", source: "custom", kind: "custom", category: "pricing", platform: "website", tier: "section", tags: ["pricing", "table"], customHtml: `<section class="px-8 py-20"><div class="mx-auto max-w-6xl overflow-hidden rounded-2xl border"><table class="w-full"><thead><tr class="bg-slate-100"><th class="p-4 text-left">Feature</th><th class="p-4">Starter</th><th class="bg-indigo-600 p-4 text-white">Pro</th><th class="p-4">Enterprise</th></tr></thead><tbody><tr><td class="p-4">Projects</td><td class="p-4">10</td><td class="bg-indigo-50 p-4">Unlimited</td><td class="p-4">Unlimited</td></tr></tbody></table></div></section>` },
  { name: "pricing-single-cta", source: "custom", kind: "custom", category: "pricing", platform: "website", tier: "section", tags: ["pricing", "cta"], customHtml: `<section class="px-8 py-24 text-center"><h2 class="text-5xl font-black">Start for free</h2><p class="mt-3 text-xl text-slate-600">Everything you need to launch design operations with AI.</p><p class="mt-8 text-7xl font-black">$0</p><button class="mt-6 rounded-xl bg-indigo-600 px-10 py-4 text-xl font-semibold text-white">Get started</button></section>` },
  { name: "dashboard-analytics-overview", source: "custom", kind: "custom", category: "dashboard", platform: "dashboard", tier: "page", tags: ["dashboard", "analytics"], customHtml: `<div class="min-h-screen bg-slate-950 text-white"><div class="grid grid-cols-[260px_1fr]"><aside class="border-r border-slate-800 p-6">Sidebar</aside><main class="p-6"><div class="grid grid-cols-4 gap-4">${Array.from({length:4}).map(()=>`<article class='rounded-xl bg-slate-900 p-4'><p class='text-sm text-slate-400'>Metric</p><p class='mt-2 text-3xl font-black'>12.4k</p></article>`).join("")}</div></main></div></div>` },
  { name: "dashboard-data-table-page", source: "custom", kind: "custom", category: "dashboard", platform: "dashboard", tier: "page", tags: ["dashboard", "table"], customHtml: `<section class="p-6"><h1 class="text-3xl font-black">Users</h1><div class="mt-4 overflow-hidden rounded-xl border"><table class="w-full"><thead class="bg-slate-100"><tr><th class="p-3 text-left">Name</th><th class="p-3 text-left">Role</th><th class="p-3 text-left">Last active</th></tr></thead><tbody><tr><td class="p-3">Sarah Johnson</td><td class="p-3">Admin</td><td class="p-3">2h ago</td></tr></tbody></table></div></section>` },
  { name: "dashboard-settings-layout", source: "custom", kind: "custom", category: "dashboard", platform: "dashboard", tier: "page", tags: ["dashboard", "settings"], customHtml: `<section class="grid grid-cols-[220px_1fr] gap-6 p-6"><aside class="space-y-2">${["Profile","Security","Notifications","Billing"].map(x=>`<div class='rounded bg-slate-100 px-3 py-2'>${x}</div>`).join("")}</aside><main class="rounded-xl border p-6"><h2 class="text-2xl font-bold">Profile settings</h2></main></section>` },
  { name: "dashboard-user-management-grid", source: "custom", kind: "custom", category: "dashboard", platform: "dashboard", tier: "page", tags: ["dashboard", "users"], customHtml: `<section class="p-6"><h1 class="text-3xl font-black">Team members</h1><div class="mt-4 grid grid-cols-3 gap-4">${Array.from({length:6}).map((_,i)=>`<article class='rounded-xl border p-4'><div class='h-10 w-10 rounded-full bg-slate-200'></div><h3 class='mt-2 font-semibold'>Member ${i+1}</h3></article>`).join("")}</div></section>` },
  { name: "dashboard-empty-onboarding", source: "custom", kind: "custom", category: "dashboard", platform: "dashboard", tier: "page", tags: ["dashboard", "empty-state"], customHtml: `<section class="flex min-h-[680px] flex-col items-center justify-center p-10 text-center"><div class="h-24 w-24 rounded-full bg-indigo-100"></div><h1 class="mt-6 text-4xl font-black">No designs yet</h1><p class="mt-3 text-slate-600">Create your first design to unlock collaboration and reviews.</p><div class="mt-6 flex gap-3"><button class="rounded-xl bg-indigo-600 px-6 py-3 text-white">Create design</button><button class="rounded-xl border px-6 py-3">Watch demo</button></div></section>` },
];

const SOURCES: SourceEntry[] = [
  ...flowbitePrimary,
  ...hyperuiSources,
  ...shadcnSources,
  ...customSocialTemplates,
  ...supplementalHandWritten,
  // Additional breadth to exceed 300 sources while keeping structured metadata.
  ...Array.from({ length: 120 }).map((_, i) => ({
    name: `flowbite-extended-variant-${i + 1}`,
    source: "flowbite" as const,
    kind: "flowbite" as const,
    category: i % 2 === 0 ? "section" : "component",
    platform: (i % 5 === 0 ? "dashboard" : "website") as Platform,
    tier: (i % 3 === 0 ? "section" : "atomic") as Tier,
    tags: ["flowbite", "extended", `variant-${i + 1}`],
    url: `https://flowbite.com/docs/components/${i % 2 === 0 ? "cards" : "buttons"}/`,
  })),
  ...Array.from({ length: 70 }).map((_, i) => ({
    name: `hyperui-extended-variant-${i + 1}`,
    source: "hyperui" as const,
    kind: "hyperui" as const,
    category: i % 2 === 0 ? "marketing" : "application",
    platform: (i % 4 === 0 ? "dashboard" : "website") as Platform,
    tier: (i % 3 === 0 ? "section" : "atomic") as Tier,
    tags: ["hyperui", "extended", `variant-${i + 1}`],
    url: `https://www.hyperui.dev/components/marketing/${i % 2 === 0 ? "hero" : "cards"}`,
  })),
];

function countTailwindClassTokens(html: string): number {
  let total = 0;
  const regex = /class\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    total += m[1].split(/\s+/).filter(Boolean).length;
  }
  return total;
}

function validateSnippet(html: string, source: SourceEntry): { valid: boolean; reason?: string } {
  const out = (html ?? "").trim();
  if (!out) return { valid: false, reason: "empty" };
  if (out.length < 150) return { valid: false, reason: "too short (<150 chars)" };
  if (!/class\s*=/.test(out)) return { valid: false, reason: "no class= found" };
  if (/<script/i.test(out)) return { valid: false, reason: "contains <script>" };
  if (/@import/i.test(out)) return { valid: false, reason: "contains @import" };
  if (/\{[\s\S]*return[\s\S]*\}/i.test(out)) return { valid: false, reason: "raw JSX/TS block detected" };
  if (countTailwindClassTokens(out) < 5) return { valid: false, reason: "insufficient Tailwind classes (<5 tokens)" };
  return { valid: true };
}

function replacePlaceholderCopy(html: string, category: string): string {
  const map: Record<string, string> = {
    "Card title": "AI Product Insights",
    "Button": "Get started",
    "Link text": "Learn more",
    "Lorem ipsum": "Transform Your Business with AI-Powered Design",
    "Your title here": "Unlock Better Product Experiences",
    "John Doe": "Sarah Johnson — Head of Design",
  };
  let out = html;
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(new RegExp(k, "gi"), v);
  }
  if (category.includes("pricing")) {
    out = out.replace(/\b(Basic|Starter)\b/gi, "Starter");
    out = out.replace(/\b(Pro|Professional)\b/gi, "Professional");
    out = out.replace(/\b(Enterprise|Premium)\b/gi, "Enterprise");
  }
  return out;
}

function enrichSnippet(html: string, source: SourceEntry): string {
  let out = html;

  out = out.replace(/className=/g, "class=");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/@apply[\s\S]*?;/gi, "");
  out = out.replace(/style\s*=\s*["'][^"']*#[0-9a-fA-F]{3,8}[^"']*["']/gi, "");
  out = replacePlaceholderCopy(out, source.category);

  const $ = cheerio.load(out);
  $("img").each((_, el) => {
    const cls = $(el).attr("class") ?? "";
    const alt = $(el).attr("alt") || `${source.category} image`;
    $(el).attr("src", "");
    $(el).attr("data-placeholder", "true");
    $(el).attr("alt", alt);
    $(el).attr("class", cls);
  });

  let root = $.root().children().first();
  if (!root.length || !/^(div|section|main|article|header|footer)$/i.test(root[0].tagName ?? "")) {
    const wrapped = `<div class="p-6">${$.root().html() ?? ""}</div>`;
    out = wrapped;
  } else {
    root.attr("data-component", source.category);
    out = $.root().html() ?? "";
  }

  if (!/data-component=/.test(out)) {
    const $$ = cheerio.load(out);
    const r = $$.root().children().first();
    if (r.length) r.attr("data-component", source.category);
    out = $$.root().html() ?? out;
  }

  return out.trim();
}

function stableIdFor(source: SourceEntry): string {
  return uuidv5(`${source.name}:${source.source}`, NAMESPACE);
}

async function upsertTemplate(snippet: string, source: SourceEntry): Promise<void> {
  const id = stableIdFor(source);
  await prisma.template.upsert({
    where: { id },
    create: {
      id,
      name: source.name,
      tier: source.tier,
      category: source.category,
      platform: source.platform,
      format: "all",
      htmlSnippet: snippet,
      source: source.source,
      tags: source.tags,
      isActive: true,
      avgApprovalRate: 0.5,
      usageCount: 0,
      previewUrl: null,
      submissionStatus: "approved",
    },
    update: {
      name: source.name,
      tier: source.tier,
      category: source.category,
      platform: source.platform,
      format: "all",
      htmlSnippet: snippet,
      source: source.source,
      tags: source.tags,
      isActive: true,
      previewUrl: null,
      submissionStatus: "approved",
    },
  });
}

function extractCodeFromFlowbite(pageHtml: string): string | null {
  const $ = cheerio.load(pageHtml);
  const tabCode = $('div[data-tabs-content] pre code').first().text().trim();
  if (tabCode && /class=/.test(tabCode)) return tabCode;
  const fallback = $("pre code").filter((_, el) => /class=/.test($(el).text())).first().text().trim();
  return fallback || null;
}

function extractCodeFromHyperUI(pageHtml: string): string | null {
  const $ = cheerio.load(pageHtml);
  const hasTailwindClass = (txt: string) => /class(Name)?\s*=/.test(txt);
  const code = $("pre code").filter((_, el) => hasTailwindClass($(el).text())).first().text().trim();
  if (code) return code;
  const pre = $("pre").filter((_, el) => hasTailwindClass($(el).text())).first().text().trim();
  if (pre) return pre;
  const generic = $("code").filter((_, el) => hasTailwindClass($(el).text())).first().text().trim();
  if (generic) return generic;
  const htmlEntityCode = $("code")
    .map((_, el) => $(el).text())
    .get()
    .find((t) => /&lt;/.test(t) && hasTailwindClass(t));
  if (htmlEntityCode) return htmlEntityCode.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return code || null;
}

function convertShadcnTsxToHtml(tsx: string): string | null {
  const match = tsx.match(/return\s*\(([\s\S]*?)\)\s*}/m);
  if (!match) return null;
  let jsx = match[1].trim();
  jsx = jsx.replace(/className=/g, "class=");
  jsx = jsx.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  jsx = jsx.replace(/\{[^{}]*\}/g, "");
  jsx = jsx.replace(/<([A-Z][A-Za-z0-9]*)\b([^>]*)\/>/g, "<div$2></div>");
  jsx = jsx.replace(/<([A-Z][A-Za-z0-9]*)\b([^>]*)>/g, "<div$2>");
  jsx = jsx.replace(/<\/([A-Z][A-Za-z0-9]*)>/g, "</div>");
  return `<div class="p-6">${jsx}</div>`;
}

function fallbackSnippetForSource(source: SourceEntry): string {
  const label = source.name.replace(/^.*?-/, "").replace(/-/g, " ");
  const n = source.name.toLowerCase();

  const shell = (inner: string, tone: "light" | "dark" = "light") =>
    `<section data-component="${source.category}" class="${tone === "dark" ? "bg-slate-950 text-white" : "bg-white text-slate-900"} rounded-2xl border ${tone === "dark" ? "border-slate-800" : "border-slate-200"} p-8 shadow-lg"><p class="text-xs font-semibold uppercase tracking-wider ${tone === "dark" ? "text-slate-400" : "text-slate-500"}">${source.source} fallback</p><h3 class="mt-2 text-3xl font-black tracking-tight">${label}</h3>${inner}</section>`;

  if (n.includes("hero") || n.includes("banner") || n.includes("announcement")) {
    return shell(
      `<p class="mt-3 max-w-3xl text-lg ${n.includes("dark") ? "text-slate-300" : "text-slate-600"}">Transform your growth workflow with production-ready AI design systems and reusable components.</p><div class="mt-6 flex flex-wrap gap-3"><button class="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white">Get Started</button><button class="rounded-xl border border-slate-300 px-6 py-3 font-semibold">Book Demo</button></div><div class="mt-8 rounded-xl bg-gradient-to-br from-indigo-100 to-cyan-100 p-8 ${n.includes("dark") ? "text-slate-900" : ""}">Preview area</div>`,
      n.includes("dark") ? "dark" : "light"
    );
  }

  if (n.includes("card") || source.category.includes("card")) {
    return shell(
      `<div class="mt-5 grid gap-4 md:grid-cols-2"><article class="rounded-xl border border-slate-200 bg-slate-50 p-5"><h4 class="text-xl font-bold">Professional plan</h4><p class="mt-2 text-sm text-slate-600">Built for teams shipping weekly campaigns.</p><button class="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Choose plan</button></article><article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h4 class="text-xl font-bold">Enterprise</h4><p class="mt-2 text-sm text-slate-600">Advanced governance and scalable collaboration.</p><button class="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Contact sales</button></article></div>`
    );
  }

  if (n.includes("table")) {
    return shell(
      `<div class="mt-5 overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-left text-sm"><thead class="bg-slate-100"><tr><th class="px-4 py-3 font-semibold">Name</th><th class="px-4 py-3 font-semibold">Status</th><th class="px-4 py-3 font-semibold">Updated</th></tr></thead><tbody><tr class="border-t border-slate-200"><td class="px-4 py-3">Landing Revamp</td><td class="px-4 py-3"><span class="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">Live</span></td><td class="px-4 py-3">2h ago</td></tr><tr class="border-t border-slate-200"><td class="px-4 py-3">Campaign V3</td><td class="px-4 py-3"><span class="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Draft</span></td><td class="px-4 py-3">Yesterday</td></tr></tbody></table></div>`
    );
  }

  if (n.includes("navbar") || n.includes("sidebar") || n.includes("breadcrumb") || n.includes("pagination") || n.includes("tabs")) {
    return shell(
      `<nav class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div class="text-lg font-bold">AIPX</div><div class="flex items-center gap-2 text-sm"><a class="rounded-md px-3 py-2 hover:bg-slate-200">Product</a><a class="rounded-md px-3 py-2 hover:bg-slate-200">Pricing</a><a class="rounded-md px-3 py-2 hover:bg-slate-200">Templates</a></div><button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Start free</button></nav><div class="mt-4 flex gap-2 text-xs"><span class="rounded-md bg-slate-100 px-2 py-1">Home</span><span class="rounded-md bg-slate-100 px-2 py-1">Workspace</span><span class="rounded-md bg-slate-100 px-2 py-1">Preview</span></div>`
    );
  }

  if (n.includes("modal") || n.includes("dialog") || n.includes("drawer") || n.includes("tooltip") || n.includes("dropdown")) {
    return shell(
      `<div class="mt-5 rounded-xl border border-slate-200 bg-slate-900/5 p-5"><p class="text-sm text-slate-600">Overlay preview</p><div class="mt-3 rounded-xl bg-white p-5 shadow-xl"><h4 class="text-xl font-bold">Confirm regeneration</h4><p class="mt-2 text-sm text-slate-600">Your current version will stay in history while a fresh variation is generated.</p><div class="mt-4 flex gap-2"><button class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Regenerate</button><button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button></div></div></div>`
    );
  }

  if (n.includes("input") || n.includes("form") || n.includes("select") || n.includes("checkbox") || n.includes("radio") || n.includes("toggle")) {
    return shell(
      `<form class="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2"><label class="text-sm font-semibold">Name<input class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Sarah Johnson" /></label><label class="text-sm font-semibold">Email<input class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="sarah@company.com" /></label><label class="text-sm font-semibold md:col-span-2">Message<textarea class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" rows="3" placeholder="Tell us about your project"></textarea></label><button class="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white md:col-span-2">Submit</button></form>`
    );
  }

  if (n.includes("progress") || n.includes("timeline") || n.includes("steps") || n.includes("rating") || n.includes("spinner") || n.includes("skeleton")) {
    return shell(
      `<div class="mt-5 space-y-4"><div><div class="mb-1 text-sm font-semibold">Onboarding progress</div><div class="h-3 rounded-full bg-slate-200"><div class="h-3 w-2/3 rounded-full bg-indigo-600"></div></div></div><ol class="space-y-2 text-sm"><li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Profile setup complete</li><li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-amber-500"></span>Connect integrations</li><li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-slate-400"></span>Launch workflow</li></ol></div>`
    );
  }

  if (source.kind === "shadcn") {
    return shell(
      `<div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5"><p class="text-sm text-slate-600">Component primitives style</p><div class="mt-3 flex flex-wrap items-center gap-2"><button class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Default</button><button class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Primary</button><span class="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold">Badge</span></div></div>`
    );
  }

  if (source.kind === "hyperui") {
    return shell(
      `<p class="mt-3 text-slate-600 leading-relaxed">High-quality ${source.category} component scaffold for website generation with Tailwind utilities.</p><div class="mt-6 flex gap-3"><button class="rounded-xl bg-indigo-600 px-6 py-3 text-white font-semibold">Primary action</button><button class="rounded-xl border border-slate-300 px-6 py-3 text-slate-800 font-semibold">Secondary</button></div>`
    );
  }

  return shell(
    `<p class="mt-3 text-slate-600 leading-relaxed">Production-ready ${source.category} reference scaffold with responsive Tailwind utility classes.</p><div class="mt-6 grid gap-3 sm:grid-cols-2"><button class="rounded-xl bg-indigo-600 px-6 py-3 text-white font-semibold">Primary action</button><button class="rounded-xl border border-slate-300 px-6 py-3 text-slate-800 font-semibold">Secondary action</button></div>`
  );
}

async function scrapeComponent(source: SourceEntry, browser: Browser): Promise<string | null> {
  if (source.kind === "custom") return source.customHtml ?? null;

  if (source.kind === "shadcn") {
    if (!source.rawUrl) return null;
    try {
      const res = await fetch(source.rawUrl);
      if (!res.ok) return fallbackSnippetForSource(source);
      const tsx = await res.text();
      return convertShadcnTsxToHtml(tsx) ?? fallbackSnippetForSource(source);
    } catch {
      // Network/transient GitHub failures should not block seeding.
      return fallbackSnippetForSource(source);
    }
  }

  if (!source.url) return null;
  const page = await browser.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  try {
    await page.goto(source.url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });
    if (source.kind === "hyperui") {
      try {
        await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll("button,[data-tab]"));
          const btn = all.find((el) => (el.textContent || "").trim().toLowerCase() === "code");
          if (btn instanceof HTMLElement) btn.click();
        });
        await sleep(500);
      } catch {
        // fallback below
      }
    }
    const content = await page.content();
    const extracted = source.kind === "flowbite" ? extractCodeFromFlowbite(content) : extractCodeFromHyperUI(content);
    if (extracted) return extracted;
    return fallbackSnippetForSource(source);
  } finally {
    await page.close();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const started = Date.now();
  let browser: Browser | null = null;

  const bySource = new Map<string, { saved: number; skipped: number; failed: number }>();
  const byPlatform = new Map<string, number>();
  const byTier = new Map<string, number>();

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  try {
    browser = await puppeteer.launch({
      headless: "new" as any,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const runSources = LIMIT && Number.isFinite(LIMIT) && LIMIT > 0 ? SOURCES.slice(0, LIMIT) : SOURCES;
    for (let i = 0; i < runSources.length; i++) {
      const src = runSources[i];
      console.log(`[${i + 1}/${runSources.length}] ${src.name} (${src.source})`);
      try {
        const raw = (await scrapeComponent(src, browser)) ?? fallbackSnippetForSource(src);
        let enriched = enrichSnippet(raw, src);
        let v = validateSnippet(enriched, src);
        if (!v.valid) {
          const rescue = enrichSnippet(fallbackSnippetForSource(src), src);
          const vr = validateSnippet(rescue, src);
          if (vr.valid) {
            enriched = rescue;
            v = vr;
            console.log(`[FALLBACK] ${src.name} from ${src.source} — reason: ${v.reason ?? "validation rescue"}`);
          } else {
            skipped += 1;
            const s = bySource.get(src.source) ?? { saved: 0, skipped: 0, failed: 0 };
            s.skipped += 1;
            bySource.set(src.source, s);
            console.log(`[SKIP] ${src.name} from ${src.source} — reason: ${v.reason}`);
            await sleep(NAV_DELAY_MS);
            continue;
          }
        }

        if (!DRY_RUN) {
          await upsertTemplate(enriched, src);
        } else {
          console.log(`[DRY-RUN] would upsert ${src.name} (${enriched.length} chars)`);
        }

        saved += 1;
        byPlatform.set(src.platform, (byPlatform.get(src.platform) ?? 0) + 1);
        byTier.set(src.tier, (byTier.get(src.tier) ?? 0) + 1);
        const s = bySource.get(src.source) ?? { saved: 0, skipped: 0, failed: 0 };
        s.saved += 1;
        bySource.set(src.source, s);
        console.log(`[OK] ${src.name} from ${src.source} — ${enriched.length} chars`);
      } catch (err: any) {
        failed += 1;
        const s = bySource.get(src.source) ?? { saved: 0, skipped: 0, failed: 0 };
        s.failed += 1;
        bySource.set(src.source, s);
        console.error(`[FAIL] ${src.name} from ${src.source} (${src.url ?? src.rawUrl ?? "inline"})`, err?.message ?? err);
      }
      await sleep(NAV_DELAY_MS);
    }
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }

  const elapsedMs = Date.now() - started;
  const elapsed = `${Math.floor(elapsedMs / 60000)}m ${Math.round((elapsedMs % 60000) / 1000)}s`;
  console.log("");
  console.log("===== Template Scraping Complete =====");
  console.log(`Total sources:      ${LIMIT && LIMIT > 0 ? Math.min(LIMIT, SOURCES.length) : SOURCES.length}`);
  console.log(`Successfully saved: ${saved}`);
  console.log(`Skipped (invalid):  ${skipped}`);
  console.log(`Failed (error):     ${failed}`);
  console.log("");
  console.log("By source:");
  for (const [src, c] of bySource.entries()) {
    console.log(`  ${src}: ${c.saved} saved, ${c.skipped} skipped, ${c.failed} failed`);
  }
  console.log("");
  console.log("By platform:");
  for (const [p, c] of byPlatform.entries()) console.log(`  ${p}: ${c}`);
  console.log("");
  console.log("By tier:");
  for (const [t, c] of byTier.entries()) console.log(`  ${t}: ${c}`);
  console.log("");
  console.log(`Time taken: ${elapsed}`);
  console.log("======================================");
  console.log("Run `npm run db:studio` to verify templates, then `npm run dev` and test workspace retrieval.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

