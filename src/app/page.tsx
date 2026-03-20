import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const brandCount = await prisma.brandProfile.count({
    where: { userId: session.user.id },
  });

  if (brandCount === 0) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
