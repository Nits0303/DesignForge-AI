import { auth } from "@/auth";

const publicPaths = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/health",
  "/api/files",
];
const authPaths = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  for (const p of publicPaths) {
    if (pathname.startsWith(p)) {
      if (p === "/api/auth" || p === "/api/health" || p === "/api/files") {
        return;
      }
      if (authPaths.some((a) => pathname.startsWith(a)) && isLoggedIn) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        return Response.redirect(url);
      }
      return;
    }
  }

  if (!isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  return;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
