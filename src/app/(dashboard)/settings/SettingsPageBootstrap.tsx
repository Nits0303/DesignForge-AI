"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SettingsPageClient from "./SettingsPageClient";

export default function SettingsPageBootstrap() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/settings/bootstrap");
      const json = await res.json();
      if (!mounted) return;
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.ok && json?.success) setData(json.data);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (!data) {
    return <div className="p-4 text-sm text-[hsl(var(--muted-foreground))]">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 p-2 sm:p-4">
      <SettingsPageClient user={data.user} totalDesigns={data.totalDesigns} totalRevisions={data.totalRevisions} />
    </div>
  );
}

