import Link from "next/link";

export const metadata = {
  title: "Template contribution guidelines | DesignForge AI",
};

export default function TemplateGuidelinesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16 text-[hsl(var(--foreground))]">
      <div>
        <h1 className="text-2xl font-bold">Template contribution guidelines</h1>
        <p className="mt-2">
          <Link href="/templates/contribute" className="text-sm font-medium text-[hsl(var(--accent))]">
            ← Back to contribute
          </Link>
        </p>
      </div>

      <section className="space-y-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">What makes a good template</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>General-purpose — remove specific brand content so others can reuse your layout.</li>
          <li>Use realistic placeholder copy instead of raw Lorem ipsum blocks.</li>
          <li>Visually complete — don&apos;t omit obvious sections users will expect.</li>
          <li>Accessible — sufficient contrast and readable type sizes.</li>
          <li>Tailwind-only styling — utility classes in HTML.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">What gets rejected</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Client logos, company names, personal photos, or identifiable brand assets.</li>
          <li>Near-duplicates of existing library templates without meaningful improvement.</li>
          <li>Templates that don&apos;t render reliably in the preview.</li>
          <li>Hardcoded hotlinked images that may break later.</li>
          <li>JavaScript, inline event handlers, or external scripts.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Technical requirements</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Complete HTML document (DOCTYPE, head with Tailwind CDN, body).</li>
          <li>Tailwind v4 utility classes; explicit dimensions on the root for social formats.</li>
          <li>Prefer placeholder images with descriptive alt text; avoid fragile external URLs.</li>
          <li>Should render at least at 1080px viewport width.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Review timeline</h2>
        <p>
          Most reviews complete within 48 hours. If changes are requested, you can update and resubmit. If rejected,
          feedback will explain what to fix — you can revise and submit again.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Attribution</h2>
        <p>
          Contributors are credited on the marketplace. Your chosen license applies to downstream use — MIT is the
          default for community templates.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Tailwind / framework versions</h2>
        <p>
          Templates are frozen at the HTML you submit and reference a specific Tailwind CDN build. If a future major
          Tailwind release changes utilities, older templates still load their pinned CDN version.
        </p>
      </section>
    </div>
  );
}
