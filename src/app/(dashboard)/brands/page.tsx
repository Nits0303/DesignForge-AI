import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { BrandsGrid } from "@/components/brand/BrandsGrid";
import { Button } from "@/components/ui/button";

export default async function BrandsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const brands = await prisma.brandProfile.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Brand Profiles</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Brand profiles are injected into every generation to keep designs consistent.
          </p>
        </div>
        <Link href="/brands/new">
          <Button>Create New Brand</Button>
        </Link>
      </div>

      <BrandsGrid initialBrands={brands as any} />
    </div>
  );
}

