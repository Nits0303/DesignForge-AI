import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  turbopack: {
    root: process.cwd(),
  },
  // Helps reduce layout.css preload warnings with Turbopack. With `next dev --webpack`, Chrome may still
  // log a benign "preloaded but not used" for layout.css — use `npm run dev:turbo` if it bothers you.
  experimental: {
    inlineCss: true,
  },
};

export default nextConfig;
