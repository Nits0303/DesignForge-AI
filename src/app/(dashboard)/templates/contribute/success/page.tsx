import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Submitted | DesignForge AI",
};

export default function ContributeSuccessPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Thank you!</h1>
      <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        Your template has been submitted for review. We typically review within 48 hours. You&apos;ll receive a
        notification when it&apos;s been reviewed.
      </p>
      <Link href="/templates/my-library" className={cn(buttonVariants())}>
        View my contributions
      </Link>
    </div>
  );
}
