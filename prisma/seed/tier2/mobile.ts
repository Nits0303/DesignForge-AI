import { upsertTemplate } from "../helpers";

const TW = "https://cdn.tailwindcss.com";

function doc(w: number, h: number, body: string) {
  return `<!DOCTYPE html>
<html lang="en" style="width:${w}px;height:${h}px;margin:0;padding:0;overflow:hidden;">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="${TW}"></script>
</head>
<body class="bg-slate-950 text-slate-100 antialiased" style="width:${w}px;height:${h}px;margin:0;padding:0;overflow:hidden;">
${body}
</body>
</html>`;
}

export async function seedMobileTier2() {
  const w = 390;
  const h = 844;

  const templates = [
    {
      name: "mobile-onboarding-welcome",
      tier: "section",
      category: "onboarding_welcome",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col px-6 pt-16 pb-10">
  <div class="h-48 rounded-3xl bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/20"></div>
  <h1 class="mt-10 text-3xl font-bold">Welcome</h1>
  <p class="mt-3 text-sm text-slate-400">Create beautiful screens in seconds.</p>
  <div class="mt-auto space-y-3">
    <button class="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white">Sign Up</button>
    <button class="w-full rounded-xl border border-slate-700 py-3 text-sm font-semibold">Sign In</button>
    <div class="flex justify-center gap-2 pt-2"><span class="h-2 w-2 rounded-full bg-indigo-400"></span><span class="h-2 w-2 rounded-full bg-slate-700"></span><span class="h-2 w-2 rounded-full bg-slate-700"></span></div>
  </div>
</div>`
      ),
      tags: ["mobile", "onboarding", "ios", "flow", "welcome"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-auth-sign-in",
      tier: "section",
      category: "auth",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col px-5 pt-14">
  <p class="text-4xl font-bold tracking-tight">Sign in</p>
  <div class="mt-8 space-y-3">
    <input class="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm" placeholder="Email" type="email"/>
    <input class="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm" placeholder="Password" type="password"/>
    <button class="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white">Sign In</button>
    <p class="text-center text-xs text-slate-500">Forgot password?</p>
  </div>
</div>`
      ),
      tags: ["mobile", "auth", "ios", "form"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-home-social-feed",
      tier: "section",
      category: "home_feed",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col">
  <header class="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm font-semibold"><span>Home</span><span>•••</span></header>
  <div class="flex gap-3 overflow-x-auto px-4 py-3"><div class="h-16 w-16 shrink-0 rounded-full bg-slate-800"></div><div class="h-16 w-16 shrink-0 rounded-full bg-slate-800"></div></div>
  <div class="flex-1 space-y-4 overflow-y-auto px-4 pb-20">
    <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"><div class="h-40 rounded-xl bg-slate-800"></div><p class="mt-2 text-sm font-semibold">Post title</p></article>
  </div>
  <nav class="absolute bottom-0 left-0 right-0 flex justify-around border-t border-slate-800 bg-slate-950 py-2 text-[10px] text-slate-400"><span>Home</span><span>Search</span><span>Create</span><span>Alerts</span><span>Profile</span></nav>
</div>`
      ),
      tags: ["mobile", "home", "feed", "ios", "social"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-profile-social",
      tier: "section",
      category: "profile",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col pb-16">
  <div class="px-4 pt-12 text-center">
    <div class="mx-auto h-24 w-24 rounded-full bg-slate-800"></div>
    <h2 class="mt-4 text-xl font-bold">Alex Designer</h2>
    <p class="text-xs text-slate-400">Product designer</p>
    <div class="mt-4 flex justify-center gap-8 text-sm"><div><div class="font-bold">120</div><div class="text-xs text-slate-500">Posts</div></div><div><div class="font-bold">4k</div><div class="text-xs text-slate-500">Followers</div></div></div>
  </div>
  <div class="mt-6 grid grid-cols-3 gap-1 px-1">
    ${Array.from({ length: 6 })
      .map(() => `<div class="aspect-square bg-slate-800"></div>`)
      .join("")}
  </div>
  <nav class="absolute bottom-0 left-0 right-0 flex justify-around border-t border-slate-800 bg-slate-950 py-2 text-[10px] text-slate-400"><span>H</span><span>S</span><span>C</span><span>N</span><span>P</span></nav>
</div>`
      ),
      tags: ["mobile", "profile", "ios"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-settings-ios",
      tier: "section",
      category: "settings",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col px-4 pt-12">
  <h1 class="text-3xl font-bold">Settings</h1>
  <p class="mt-1 text-xs uppercase text-slate-500">General</p>
  <div class="mt-3 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/50">
    <div class="flex items-center justify-between px-4 py-3 text-sm"><span>Notifications</span><span class="text-slate-500">›</span></div>
    <div class="flex items-center justify-between px-4 py-3 text-sm"><span>Privacy</span><span class="text-slate-500">›</span></div>
  </div>
  <p class="mt-6 text-xs uppercase text-slate-500">Account</p>
  <div class="mt-3 rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-center text-sm text-red-300">Sign Out</div>
</div>`
      ),
      tags: ["mobile", "settings", "ios", "list"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-product-detail",
      tier: "section",
      category: "product",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col">
  <div class="h-72 bg-slate-800"></div>
  <div class="flex-1 px-4 pt-4">
    <h1 class="text-xl font-bold">Canvas Sneaker</h1>
    <p class="mt-1 text-lg font-semibold text-indigo-300">$129</p>
    <p class="mt-2 text-sm text-slate-400">Soft sole · Free returns</p>
  </div>
  <div class="border-t border-slate-800 p-4"><button class="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white">Add to Cart</button></div>
</div>`
      ),
      tags: ["mobile", "detail", "product", "ios"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-chat-conversation",
      tier: "section",
      category: "chat",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col">
  <header class="border-b border-slate-800 px-4 py-3 text-sm font-semibold">Messages</header>
  <div class="flex-1 space-y-2 overflow-y-auto px-4 py-4">
    <div class="ml-auto max-w-[80%] rounded-2xl bg-indigo-600 px-3 py-2 text-sm">Hey there!</div>
    <div class="max-w-[80%] rounded-2xl bg-slate-800 px-3 py-2 text-sm">Hi! Ready to review?</div>
  </div>
  <div class="flex gap-2 border-t border-slate-800 p-3"><input class="flex-1 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm" placeholder="Message"/><button class="rounded-full bg-indigo-500 px-4 text-sm font-semibold">Send</button></div>
</div>`
      ),
      tags: ["mobile", "utility", "ios", "chat"],
      source: "sprint14",
      isActive: true,
    },
    {
      name: "mobile-checkout-cart",
      tier: "section",
      category: "checkout",
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col px-4 pt-12">
  <h1 class="text-2xl font-bold">Cart</h1>
  <div class="mt-6 space-y-3">
    <div class="flex gap-3 rounded-2xl border border-slate-800 p-3"><div class="h-16 w-16 rounded-lg bg-slate-800"></div><div class="flex-1"><div class="text-sm font-semibold">Item</div><div class="text-xs text-slate-500">Qty 1</div></div><div class="font-semibold">$49</div></div>
  </div>
  <div class="mt-auto space-y-3 pb-8">
    <div class="flex justify-between text-sm"><span>Total</span><span class="font-bold">$49</span></div>
    <button class="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white">Place Order</button>
  </div>
</div>`
      ),
      tags: ["mobile", "checkout", "ecommerce", "ios"],
      source: "sprint14",
      isActive: true,
    },
  ];

  const extraCategories = [
    "search",
    "notifications",
    "empty_state",
    "error_state",
    "loading",
    "permissions",
    "paywall",
    "subscription",
    "map",
    "calendar",
    "music_player",
    "video_player",
    "wallet",
    "receipt",
    "tracking",
    "reviews",
    "filters",
    "sort",
    "menu_drawer",
    "share_sheet",
    "success",
    "invite",
    "feature_tour",
    "splash",
    "theme_picker",
    "language",
    "help_center",
  ] as const;

  for (let i = 0; i < extraCategories.length; i++) {
    const cat = extraCategories[i]!;
    templates.push({
      name: `mobile-pattern-${cat}-${i}`,
      tier: "section",
      category: cat,
      platform: "mobile",
      htmlSnippet: doc(
        w,
        h,
        `<div class="flex h-full flex-col px-5 pt-14">
  <p class="text-xs uppercase tracking-wide text-slate-500">${cat.replace(/_/g, " ")}</p>
  <h1 class="mt-2 text-2xl font-bold">Screen</h1>
  <div class="mt-6 flex-1 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">Content area</div>
  <button class="mt-4 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white">Continue</button>
</div>`
      ),
      tags: ["mobile", "pattern", cat, "sprint14"],
      source: "sprint14",
      isActive: true,
    });
  }

  for (const tpl of templates) {
    try {
      await upsertTemplate(tpl as any);
    } catch (err) {
      console.error("Failed to upsert mobile template", tpl.name, err);
    }
  }
}
