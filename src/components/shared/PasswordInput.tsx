import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = React.ComponentPropsWithoutRef<typeof Input>;

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [reveal, setReveal] = React.useState(false);

    const stopReveal = () => setReveal(false);
    const startReveal = () => setReveal(true);

    const preventClipboard = (e: React.ClipboardEvent<HTMLInputElement>) => {
      // Prevent copying the password into the clipboard.
      e.preventDefault();
    };

    const preventContextMenu = (e: React.MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          className={cn("pr-9", className)}
          {...props}
          type={reveal ? "text" : "password"}
          onCopy={preventClipboard}
          onCut={preventClipboard}
          onContextMenu={preventContextMenu}
        />
        <button
          type="button"
          onMouseDown={(e) => {
            // Hold-to-reveal: prevent focus loss while pressing.
            e.preventDefault();
            startReveal();
          }}
          onMouseUp={() => stopReveal()}
          onMouseLeave={() => stopReveal()}
          onTouchStart={(e) => {
            e.preventDefault();
            startReveal();
          }}
          onTouchEnd={() => stopReveal()}
          onTouchCancel={() => stopReveal()}
          aria-label="Hold to reveal password"
          className="absolute inset-y-0 right-2 flex items-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus:outline-none"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

