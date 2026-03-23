"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Instagram, Linkedin, Globe, Smartphone, LayoutDashboard, Facebook, Twitter } from "lucide-react";
import { PLATFORM_SPECS } from "@/constants/platforms";

type Props = {
  value: string;
  onChange: (next: string) => void;
  textareaId?: string;
};

type ShortcodeDef = {
  code: string;
  platform: keyof typeof PLATFORM_SPECS;
  description: string;
  formats: string[];
};

const SHORTCODES: ShortcodeDef[] = [
  {
    code: "/instagram",
    platform: "instagram",
    description: "Posts, stories, and carousels at 1080×1080",
    formats: ["post", "story", "carousel 3 slides", "carousel 5 slides", "reel cover"],
  },
  {
    code: "/linkedin",
    platform: "linkedin",
    description: "Feed posts and profile banners",
    formats: ["post", "banner"],
  },
  {
    code: "/facebook",
    platform: "facebook",
    description: "Feed posts and tall stories",
    formats: ["post", "story"],
  },
  {
    code: "/twitter",
    platform: "twitter",
    description: "Landscape posts and banners",
    formats: ["post", "banner"],
  },
  {
    code: "/website",
    platform: "website",
    description: "Landing pages and hero sections",
    formats: ["landing", "banner"],
  },
  {
    code: "/mobile",
    platform: "mobile",
    description: "Mobile app screens and flows",
    formats: ["screen"],
  },
  {
    code: "/dashboard",
    platform: "dashboard",
    description: "Product dashboards and admin views",
    formats: ["screen"],
  },
];

function platformIcon(platform: string) {
  switch (platform) {
    case "instagram":
      return <Instagram className="h-3.5 w-3.5" />;
    case "linkedin":
      return <Linkedin className="h-3.5 w-3.5" />;
    case "facebook":
      return <Facebook className="h-3.5 w-3.5" />;
    case "twitter":
      return <Twitter className="h-3.5 w-3.5" />;
    case "mobile":
      return <Smartphone className="h-3.5 w-3.5" />;
    case "dashboard":
      return <LayoutDashboard className="h-3.5 w-3.5" />;
    default:
      return <Globe className="h-3.5 w-3.5" />;
  }
}

export function ShortcodeAutocomplete({ value, onChange, textareaId }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"platform" | "format">("platform");
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const platformListRef = useRef<HTMLDivElement | null>(null);
  const formatListRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<ShortcodeDef | null>(null);

  const triggerInfo = useMemo(() => {
    const caretIndex = value.length;
    const before = value.slice(0, caretIndex);
    const lastSlash = before.lastIndexOf("/");
    if (lastSlash === -1) return null;
    if (lastSlash > 0 && /\S/.test(before[lastSlash - 1]!)) {
      return null;
    }
    const fragment = before.slice(lastSlash, caretIndex);
    return { start: lastSlash, fragment };
  }, [value]);

  const platformFiltered = useMemo(() => {
    if (!triggerInfo) return SHORTCODES;
    const q = triggerInfo.fragment.toLowerCase();
    return SHORTCODES.filter((s) => s.code.toLowerCase().startsWith(q));
  }, [triggerInfo]);

  const formatOptions = useMemo(() => {
    if (!selectedPlatform) return [];
    return selectedPlatform.formats;
  }, [selectedPlatform]);

  useEffect(() => {
    if (!textareaRef.current || !triggerInfo || !isTextareaFocused) {
      setOpen(false);
      setSelectedPlatform(null);
      setMode("platform");
      return;
    }
    const rect = textareaRef.current.getBoundingClientRect();
    setAnchorRect(rect);
    setOpen(true);
    setMode(selectedPlatform ? "format" : "platform");
    setActiveIndex(0);
  }, [triggerInfo, selectedPlatform, isTextareaFocused]);

  useEffect(() => {
    if (value.trim().length > 0) return;
    setOpen(false);
    setSelectedPlatform(null);
    setMode("platform");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const listEl = mode === "platform" ? platformListRef.current : formatListRef.current;
    const activeEl = activeItemRef.current;
    if (!listEl || !activeEl) return;
    activeEl.scrollIntoView({ block: "nearest" });
  }, [activeIndex, mode, open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedPlatform(null);
        setMode("platform");
        setIsTextareaFocused(false);
      }
    }
    if (!open) return;
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function replaceFragment(text: string) {
    if (!triggerInfo) return text;
    const before = value.slice(0, triggerInfo.start);
    const after = value.slice(triggerInfo.start + triggerInfo.fragment.length);
    return `${before}${text}${after}`;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (mode === "platform") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(platformFiltered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const chosen = platformFiltered[activeIndex];
        if (chosen) {
          const next = replaceFragment(chosen.code + " ");
          onChange(next);
          setSelectedPlatform(chosen);
          setMode("format");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setSelectedPlatform(null);
      }
    } else if (mode === "format") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(formatOptions.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const chosen = formatOptions[activeIndex];
        if (chosen) {
          const appended = `${value.trimEnd()} ${chosen} `;
          onChange(appended);
        }
        setOpen(false);
        setSelectedPlatform(null);
        setMode("platform");
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setSelectedPlatform(null);
        setMode("platform");
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <textarea
        id={textareaId}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsTextareaFocused(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            setSelectedPlatform(null);
            setMode("platform");
            setIsTextareaFocused(false);
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        rows={4}
        className="w-full resize-none rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
        placeholder="Describe your design, or start with /instagram, /linkedin, /website..."
      />
      {open && anchorRect && (
        <div
          className="absolute z-40 mt-1 w-full max-w-sm rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-1 shadow-lg"
          style={{ top: "100%", left: 0 }}
        >
          {mode === "platform" ? (
            <div ref={platformListRef} className="max-h-64 overflow-y-auto">
              {platformFiltered.map((item, idx) => (
                <button
                  key={item.code}
                  type="button"
                  ref={idx === activeIndex ? activeItemRef : null}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const next = replaceFragment(item.code + " ");
                    onChange(next);
                    setSelectedPlatform(item);
                    setMode("format");
                  }}
                  className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    idx === activeIndex
                      ? "bg-[hsl(var(--accent-muted))]"
                      : "hover:bg-[hsl(var(--surface))]"
                  }`}
                >
                  <div className="mt-0.5 text-[hsl(var(--accent))]">{platformIcon(item.platform)}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{item.code}</div>
                    <div className="mt-0.5 text-[hsl(var(--muted-foreground))]">
                      {item.description}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.formats.map((fmt) => (
                        <span
                          key={fmt}
                          className="rounded-full bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                        >
                          {fmt}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div ref={formatListRef} className="max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                <span>{selectedPlatform?.code}</span>
                <span className="inline-flex items-center gap-1">
                  Formats <ChevronDown className="h-3 w-3" />
                </span>
              </div>
              {formatOptions.map((fmt, idx) => (
                <button
                  key={fmt}
                  type="button"
                  ref={idx === activeIndex ? activeItemRef : null}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const appended = `${value.trimEnd()} ${fmt} `;
                    onChange(appended);
                    setOpen(false);
                    setSelectedPlatform(null);
                    setMode("platform");
                  }}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${
                    idx === activeIndex
                      ? "bg-[hsl(var(--accent-muted))]"
                      : "hover:bg-[hsl(var(--surface))]"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

