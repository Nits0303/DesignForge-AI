"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[WorkspaceErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-[calc(100vh-56px)] flex-col items-center justify-center gap-4 bg-[hsl(var(--background))] p-4 text-center">
        <div className="text-lg font-semibold">Something went wrong in the workspace</div>
        <details className="max-w-xl rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 text-left text-xs text-[hsl(var(--muted-foreground))]">
          <summary>Error details</summary>
          <pre className="mt-2 whitespace-pre-wrap">
            {this.state.error?.message ?? "Unknown error"}
          </pre>
        </details>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded bg-[hsl(var(--accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--accent-foreground))]"
            onClick={() => window.location.reload()}
          >
            Reload workspace
          </button>
          <Link
            href="/dashboard"
            className="rounded border border-[hsl(var(--border))] px-4 py-2 text-sm font-semibold"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
}

