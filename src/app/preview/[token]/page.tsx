import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { sanitizeHtmlForIframe } from "@/lib/ai/htmlSanitizer.client";

export const runtime = "nodejs";

export default async function SharePreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // New: check temporary ShareLink records first (Figma Bridge exports).
  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      design: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  let design: any = null;
  let version: any = null;

  if (shareLink) {
    if (shareLink.expiresAt < new Date()) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4 text-center">
          <div className="max-w-md space-y-4 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-6 shadow-xl">
            <div className="text-4xl">⏱️</div>
            <h1 className="text-xl font-semibold">Link Expired</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              This shared design link has expired. Please generate a fresh link.
            </p>
          </div>
        </div>
      );
    }

    design = shareLink.design;
    version = await prisma.designVersion.findFirst({
      where: { designId: shareLink.designId, versionNumber: shareLink.versionNumber },
    });
  } else {
    // Backward compatibility: support older share links stored directly on Design.
    design = await prisma.design.findUnique({
      where: { shareToken: token },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        user: { select: { name: true, email: true } },
      },
    });

    if (!design || !design.versions[0]) notFound();

    // Check expiry
    if (design.shareExpiry && design.shareExpiry < new Date()) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4 text-center">
          <div className="max-w-md space-y-4 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-6 shadow-xl">
            <div className="text-4xl">⏱️</div>
            <h1 className="text-xl font-semibold">Link Expired</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              This shared design link has expired. Please ask the creator for a new link.
            </p>
          </div>
        </div>
      );
    }

    version = design.versions[0];
  }

  if (!design || !version) notFound();

  const safeHtml = sanitizeHtmlForIframe(version.htmlContent);

  // Parse dimensions
  let width = 1080;
  let height = 1080;
  if (design.dimensions && typeof design.dimensions === "object") {
    const d = design.dimensions as any;
    if (typeof d.width === "number") width = d.width;
    if (typeof d.height === "number") height = d.height;
  }

  const title = design.title || "Untitled Design";

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Main preview stage */}
      <main className="flex flex-1 items-center justify-center overflow-auto p-8">
        <div
          className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-white shadow-2xl"
          style={{ width, height, maxWidth: "100%", maxHeight: "100%" }}
        >
          <iframe
            title={`${title} preview`}
            sandbox="allow-scripts"
            srcDoc={safeHtml}
            className="h-full w-full border-0"
            style={{ display: "block" }}
          />
        </div>
      </main>

      {/* Footer attribution (required for public preview links) */}
      <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-6 py-3">
        <div className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          Created with{" "}
          <a
            href={process.env.NEXTAUTH_URL ?? "/"}
            className="font-semibold text-[hsl(var(--foreground))] underline"
          >
            DesignForge AI
          </a>
        </div>
      </footer>
    </div>
  );
}
