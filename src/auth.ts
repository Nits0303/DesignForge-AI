import NextAuth from "next-auth";

// Edge-safe auth() for middleware: no Prisma imports here.
export const { auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
});

