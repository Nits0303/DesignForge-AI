"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; title?: string };
type State = { hasError: boolean; message?: string };

export class AdminSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AdminSectionErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-950/30 p-4 text-sm">
          <div className="font-semibold text-red-200">{this.props.title ?? "This section failed to render"}</div>
          <p className="mt-1 text-[hsl(var(--muted-foreground))]">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
