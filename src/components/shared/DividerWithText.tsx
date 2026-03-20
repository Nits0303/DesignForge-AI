import { cn } from "@/lib/utils";

export function DividerWithText({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
      <div className="h-px flex-1 bg-[hsl(var(--border))]" />
      <span className={cn("uppercase tracking-wide")}>{text}</span>
      <div className="h-px flex-1 bg-[hsl(var(--border))]" />
    </div>
  );
}

