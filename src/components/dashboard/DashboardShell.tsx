"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Brush,
  FolderKanban,
  Gauge,
  Layers3,
  Palette,
  Rows3,
  Settings,
  Sparkles,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { BrandSwitcher } from "@/components/brand/BrandSwitcher";
import { useUIStore } from "@/store/useUIStore";

type Props = {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null; image?: string | null };
  hasBrands: boolean;
};

const SIDEBAR_KEY = "df:sidebar_open";

export function DashboardShell({ children, user, hasBrands }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSidebarOpen, setSidebarOpen } = useUIStore();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved === "0") setSidebarOpen(false);
      if (saved === "1") setSidebarOpen(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, isSidebarOpen ? "1" : "0");
    } catch {}
  }, [isSidebarOpen]);

  const links = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/workspace", label: "Workspace", icon: Brush },
      { href: "/designs", label: "My Designs", icon: Layers3 },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/brands", label: "Brands", icon: Palette },
      { href: "/batch", label: "Batch", icon: Boxes },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="sticky top-0 z-40 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="rounded-[var(--radius)] p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]"
            aria-label="Toggle sidebar"
          >
            <Rows3 className="h-5 w-5" />
          </button>

          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="text-sm font-semibold">DesignForge AI</div>
          </Link>

          <div className="ml-2 hidden sm:block">
            <BrandSwitcher />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={() => router.push("/workspace")}
              className="hidden sm:inline-flex"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              New Design
            </Button>

            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm"
                onClick={() => router.push("/settings")}
              >
                <span className="h-6 w-6 overflow-hidden rounded-full bg-[hsl(var(--border))]">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="avatar" className="h-6 w-6" />
                  ) : null}
                </span>
                <span className="hidden sm:block">{user.name ?? "Account"}</span>
              </button>
            </div>

            <Button
              variant="ghost"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        <aside
          className={`${
            isSidebarOpen ? "w-60" : "w-14"
          } border-r border-[hsl(var(--border))] bg-[hsl(var(--background))] transition-[width] duration-200`}
        >
          <nav className="p-2">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`mb-2 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                    active
                      ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))] border-l-2 border-[hsl(var(--accent))]"
                      : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  <Icon className="h-4 w-4 text-[hsl(var(--foreground))]" />
                  {isSidebarOpen ? (
                    <span className="text-[hsl(var(--foreground))]">{label}</span>
                  ) : null}
                </Link>
              );
            })}
            <Link
              href="/settings"
              className={`mt-4 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-[15px] font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]`}
            >
              <Settings className="h-4 w-4 text-[hsl(var(--foreground))]" />
              {isSidebarOpen ? (
                <span className="text-[hsl(var(--foreground))]">Settings</span>
              ) : null}
            </Link>
          </nav>
        </aside>

        <main className="flex-1 h-full overflow-y-auto p-4 bg-[hsl(var(--surface))]">
          {!hasBrands ? (
            <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
              You don&apos;t have a brand profile yet.{" "}
              <Link className="font-semibold text-[hsl(var(--accent))]" href="/brands/new">
                Create one
              </Link>{" "}
              to improve design output quality.
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

