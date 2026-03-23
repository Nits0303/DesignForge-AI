import { TemplateDetailClient } from "@/components/marketplace/TemplateDetailClient";

export const metadata = {
  title: "Template | DesignForge AI",
};

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateDetailClient id={id} />;
}
