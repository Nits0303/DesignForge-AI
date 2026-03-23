import Link from "next/link";

export const metadata = {
  title: "API Reference | DesignForge AI",
};

const sections = [
  { id: "start", title: "Getting started" },
  { id: "auth", title: "Authentication" },
  { id: "designs", title: "Designs" },
  { id: "more", title: "Brands, batch, webhooks" },
  { id: "errors", title: "Errors" },
];

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-6xl gap-8 p-4 lg:flex">
      <nav className="lg:w-56 shrink-0 space-y-1 lg:sticky lg:top-4 lg:self-start">
        <div className="text-sm font-semibold text-[hsl(var(--foreground))]">API reference</div>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="block rounded-md px-2 py-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-elevated))] hover:text-[hsl(var(--foreground))]"
          >
            {s.title}
          </a>
        ))}
        <Link href="/settings/api" className="mt-4 block text-sm text-[hsl(var(--accent))]">
          Manage API keys →
        </Link>
      </nav>
      <div className="min-w-0 flex-1 space-y-10 text-sm leading-relaxed">
        <section id="start" className="scroll-mt-24">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">External API (v1)</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            Base URL: <code className="rounded bg-[hsl(var(--surface-elevated))] px-1.5 py-0.5 font-mono text-xs">/api/v1</code>
          </p>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            Authenticate with <code className="font-mono text-xs">Authorization: Bearer &lt;api_key&gt;</code> or{" "}
            <code className="font-mono text-xs">X-API-Key</code>. Responses include{" "}
            <code className="font-mono text-xs">X-Request-ID</code>, <code className="font-mono text-xs">API-Version: v1</code>
            , and rate limit headers.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4 font-mono text-xs text-[hsl(var(--foreground))]">
            {`curl -s https://your-deployment.example/api/v1/health`}
          </pre>
        </section>

        <section id="auth" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Authentication</h2>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            Create keys in <Link href="/settings/api" className="text-[hsl(var(--accent))]">Settings → Developer API</Link>. Assign
            least-privilege scopes (e.g. <code className="font-mono">design:read</code>, <code className="font-mono">design:generate</code>
            ).
          </p>
        </section>

        <section id="designs" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Designs</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[hsl(var(--muted-foreground))]">
            <li>
              <code className="font-mono text-xs">GET /api/v1/health</code> — public health check
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/me</code> — profile + key metadata
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/designs</code> — list designs (<code className="font-mono">design:read</code>)
            </li>
            <li>
              <code className="font-mono text-xs">POST /api/v1/designs/generate</code> —{" "}
              <code className="font-mono">synchronous: true</code> → <strong>200</strong> with preview; omit or false →{" "}
              <strong>202</strong> + <code className="font-mono">jobId</code>, poll{" "}
              <code className="font-mono">GET /api/v1/jobs/generation/:id</code> (<code className="font-mono">design:generate</code>)
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/designs/:id</code>, <code className="font-mono">.../status</code>,{" "}
              <code className="font-mono">.../html</code> — metadata, status, HTML body (<code className="font-mono">design:read</code>)
            </li>
            <li>
              <code className="font-mono text-xs">POST /api/v1/designs/:id/approve</code> (<code className="font-mono">design:approve</code>)
            </li>
            <li>
              <code className="font-mono text-xs">POST /api/v1/designs/:id/revise</code> — body{" "}
              <code className="font-mono">revisionPrompt</code> (<code className="font-mono">design:revise</code>)
            </li>
            <li>
              <code className="font-mono text-xs">POST /api/v1/designs/:id/export</code> — enqueue export,{" "}
              <strong>202</strong> + <code className="font-mono">jobId</code> (<code className="font-mono">design:export</code>)
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/exports/:jobId/status</code> — export job status (<code className="font-mono">design:export</code>)
            </li>
          </ul>
        </section>

        <section id="more" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Brands, templates, batch, webhooks, keys</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[hsl(var(--muted-foreground))]">
            <li>
              <code className="font-mono text-xs">GET /api/v1/brands</code>, <code className="font-mono">GET /api/v1/brands/:id</code> —{" "}
              <code className="font-mono">brand:read</code>
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/templates</code> — marketplace templates (<code className="font-mono">templates:read</code>)
            </li>
            <li>
              <code className="font-mono text-xs">GET|POST /api/v1/batch/jobs</code>, <code className="font-mono">GET /api/v1/batch/jobs/:id</code> —{" "}
              list/create batch, job detail (<code className="font-mono">batch:create</code>)
            </li>
            <li>
              <code className="font-mono text-xs">POST /api/v1/webhooks/test</code> — send signed test event (<code className="font-mono">webhooks:test</code>)
            </li>
            <li>
              <code className="font-mono text-xs">POST /api/v1/keys/rotate</code> — rotate the key used for the request (<code className="font-mono">keys:rotate</code>)
            </li>
          </ul>
        </section>

        <section id="errors" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Errors</h2>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            Error envelope: <code className="font-mono text-xs">success: false</code>,{" "}
            <code className="font-mono text-xs">error.code</code>, <code className="font-mono text-xs">error.message</code>,{" "}
            <code className="font-mono text-xs">requestId</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
