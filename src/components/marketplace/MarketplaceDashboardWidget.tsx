"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; previewUrl: string | null; htmlSnippet?: string | null; previewImages?: unknown };

function buildCardPreviewDoc(snippet: string): string {
  const source = (snippet ?? "").trim();
  if (!source) return "<!doctype html><html><body></body></html>";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html,body{margin:0;padding:0;background:#fff;color:#0f172a}
*{box-sizing:border-box}
:root{
  --accent:245 83% 66%;
  --accent-foreground:0 0% 100%;
  --accent-hover:245 83% 60%;
  --border:220 20% 85%;
  --background:220 35% 98%;
  --surface:0 0% 100%;
  --surface-elevated:220 20% 96%;
  --foreground:224 35% 12%;
  --muted-foreground:220 15% 45%;
  --success:142 72% 29%;
}
body{display:flex;align-items:center;justify-content:center;overflow:hidden}
#stage{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
</style>
<script>
(function(){
  try {
    var pat=/cdn\\.tailwindcss\\.com should not be used in production/i;
    var ow=console.warn?console.warn.bind(console):null;
    if(ow){console.warn=function(){try{var m=arguments&&arguments[0]!=null?String(arguments[0]):"";if(pat.test(m))return;}catch(_){}return ow.apply(console,arguments);};}
  } catch(_) {}
  function fit(){
    try{
      var stage=document.getElementById("stage");
      if(!stage||!stage.firstElementChild) return;
      var root=stage.firstElementChild;
      root.style.transform="";
      root.style.transformOrigin="center center";
      var sw=root.scrollWidth||root.clientWidth||1;
      var sh=root.scrollHeight||root.clientHeight||1;
      var vw=window.innerWidth||1;
      var vh=window.innerHeight||1;
      var sc=Math.min(vw/sw,vh/sh,1);
      root.style.transform="scale("+sc+")";
    }catch(_){}
  }
  window.addEventListener("load",fit);
  window.addEventListener("resize",fit);
  setTimeout(fit,0); setTimeout(fit,120);
})();
</script>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
</head><body><div id="stage">${source}</div></body></html>`;
}

export function MarketplaceDashboardWidget() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/templates/marketplace?sort=newest&limit=4");
      const json = await res.json();
      if (json.success) setItems(json.data.items ?? []);
    })();
  }, []);

  if (items.length === 0) return null;

  const thumb = (t: Item) => {
    const imgs = t.previewImages as string[] | undefined;
    if (imgs?.[0]) return imgs[0];
    return t.previewUrl;
  };

  return (
    <div className="mb-8 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">New in the marketplace</div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Fresh community templates</div>
        </div>
        <Link href="/templates" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Browse marketplace
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((t) => (
          <Link
            key={t.id}
            href={`/templates/${t.id}`}
            className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] transition hover:border-[hsl(var(--accent))]"
          >
            <div className="aspect-[4/3] bg-[hsl(var(--background))]">
              {thumb(t) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb(t)!} alt="" className="h-full w-full object-cover" />
              ) : t.htmlSnippet ? (
                <iframe
                  title={t.name}
                  srcDoc={buildCardPreviewDoc(t.htmlSnippet)}
                  className="h-full w-full border-0 bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-[hsl(var(--muted-foreground))]">
                  Preview
                </div>
              )}
            </div>
            <div className="line-clamp-2 p-2 text-[11px] font-medium">{t.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
