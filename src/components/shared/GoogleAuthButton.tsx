import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

type Props = {
  label: string;
};

export function GoogleAuthButton({ label }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);
      await signIn("google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full flex items-center justify-center gap-2"
      onClick={handleClick}
      disabled={loading}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        className="h-4 w-4"
        viewBox="0 0 24 24"
      >
        <path
          fill="#EA4335"
          d="M11.99 13.5v-3h9.03c.09.51.14 1.05.14 1.65 0 4.73-3.17 8.1-8.88 8.1A9.75 9.75 0 0 1 3 12 9.75 9.75 0 0 1 12.28 2.25c2.63 0 4.68.93 6.16 2.44l-2.52 2.43c-.65-.63-1.8-1.37-3.64-1.37-3.12 0-5.66 2.58-5.66 5.75s2.54 5.75 5.66 5.75c3.61 0 4.95-2.32 5.16-3.8h-4.55z"
        />
      </svg>
      <span>{loading ? "Redirecting..." : label}</span>
    </Button>
  );
}

