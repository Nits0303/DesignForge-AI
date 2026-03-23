import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

export const runtime = "nodejs";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  redirect("/dashboard");
}
