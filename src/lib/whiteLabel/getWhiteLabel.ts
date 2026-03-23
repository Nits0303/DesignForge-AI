import { cache } from "react";
import { prisma } from "@/lib/db/prisma";

export type PublicWhiteLabel = {
  isEnabled: boolean;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  hidePoweredBy: boolean;
};

/** Safe defaults when DB is empty, table missing, or query fails (e.g. before `prisma db push`). */
const DEFAULT_PUBLIC_WHITELABEL: PublicWhiteLabel = {
  isEnabled: false,
  appName: "DesignForge AI",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: null,
  supportEmail: null,
  privacyPolicyUrl: null,
  termsUrl: null,
  hidePoweredBy: false,
};

export const getPublicWhiteLabel = cache(async (): Promise<PublicWhiteLabel> => {
  try {
    const row = await prisma.whiteLabelConfig.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return { ...DEFAULT_PUBLIC_WHITELABEL };
    }
    return {
      isEnabled: row.isEnabled,
      appName: row.appName,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      primaryColor: row.primaryColor,
      supportEmail: row.supportEmail,
      privacyPolicyUrl: row.privacyPolicyUrl,
      termsUrl: row.termsUrl,
      hidePoweredBy: row.hidePoweredBy,
    };
  } catch (e: unknown) {
    // P2021 = table missing; other errors = DB unreachable / out of sync. Never 500 the whole app.
    // No console spam — fix the root cause: keep DB in sync with prisma/schema.prisma (see docs/DATABASE.md).
    if (process.env.DEBUG_WHITELABEL === "1") {
      console.error("[white-label] using defaults:", e);
    }
    return { ...DEFAULT_PUBLIC_WHITELABEL };
  }
});
