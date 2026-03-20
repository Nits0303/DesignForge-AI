"use client";

import React from "react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class PreviewErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PreviewErrorBoundary] Preview render error:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    // Re-apply previewHtml from store to trigger a fresh render
    const html = useWorkspaceStore.getState().previewHtml;
    useWorkspaceStore.getState().setPreviewHtml("");
    requestAnimationFrame(() => {
      useWorkspaceStore.getState().setPreviewHtml(html);
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-6 text-center">
          <div className="text-2xl">⚠️</div>
          <div className="text-sm font-medium">Preview failed to render</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            An error occurred while rendering the design preview.
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-1.5 text-xs hover:bg-[hsl(var(--surface-elevated))]"
          >
            Reload preview
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
