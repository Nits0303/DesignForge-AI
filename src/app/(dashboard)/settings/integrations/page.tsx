import { AdminSectionErrorBoundary } from "@/components/admin/AdminSectionErrorBoundary";
import IntegrationsPageClient from "./IntegrationsPageClient";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6 p-2 sm:p-4">
      <AdminSectionErrorBoundary title="Integrations (e.g. Figma)">
        <IntegrationsPageClient />
      </AdminSectionErrorBoundary>
    </div>
  );
}
