import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { BrandDetailClient } from "@/components/brand/BrandDetailClient";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { id } = await params;
  const brand = await prisma.brandProfile.findFirst({
    where: { id, userId },
    include: { assets: true },
  });

  if (!brand) notFound();

  return <BrandDetailClient initialBrand={brand as any} />;
}

