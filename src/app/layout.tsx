import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { Toaster } from "@/components/ui/toaster";
import { ToastHost } from "@/components/ui/ToastHost";
import { ensureBackgroundCronsStarted } from "@/lib/runtime/startup";
import { getPublicWhiteLabel } from "@/lib/whiteLabel/getWhiteLabel";
import { whiteLabelAccentCss } from "@/lib/color/hexAccentCss";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const wl = await getPublicWhiteLabel();
  const base: Metadata = {
    description: wl.isEnabled ? `${wl.appName} — design generation.` : "AI-powered design generation platform.",
  };
  if (wl.isEnabled) {
    base.title = { default: wl.appName, template: `%s | ${wl.appName}` };
    if (wl.faviconUrl) base.icons = { icon: wl.faviconUrl };
  } else {
    base.title = { default: "DesignForge AI", template: "%s | DesignForge AI" };
  }
  return base;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensureBackgroundCronsStarted();
  const wl = await getPublicWhiteLabel();
  const wlStyle =
    wl.isEnabled && wl.primaryColor
      ? whiteLabelAccentCss(wl.primaryColor) ?? ""
      : "";

  return (
    <html lang="en">
      <body className={inter.variable}>
        {wlStyle ? <style dangerouslySetInnerHTML={{ __html: wlStyle }} /> : null}
        <SessionProvider>
          {children}
          <Toaster />
          <ToastHost />
        </SessionProvider>
      </body>
    </html>
  );
}
