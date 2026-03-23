import { ApiSettingsClient } from "@/components/settings/ApiSettingsClient";
import Link from "next/link";

export const metadata = {
  title: "Developer API | Settings | DesignForge AI",
};

export default function ApiSettingsPage() {
  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="text-sm">
        <Link href="/settings" className="text-[hsl(var(--accent))] hover:underline">
          ← Back to settings
        </Link>
      </div>
      <ApiSettingsClient />
    </div>
  );
}
