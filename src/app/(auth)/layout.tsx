import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <div className="text-2xl font-bold text-[hsl(var(--foreground))]">
          DesignForge AI
        </div>
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}

