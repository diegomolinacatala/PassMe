"use client";

import { unstable_rethrow } from "next/navigation";
import { Component, type ReactNode } from "react";

interface ActionErrorBoundaryProps {
  children: ReactNode;
  /** What replaces the form when its Server Action never answered; `retry` shows the form again. */
  fallback: (retry: () => void) => ReactNode;
}

interface ActionErrorBoundaryState {
  error: unknown;
  failed: boolean;
}

/**
 * Catches a Server Action that never answered (offline, a new deploy) in the
 * form below it, so only that form shows the problem instead of the whole page
 * turning into the error screen. Unlike wrapping the action in a client
 * function, the form keeps its Server Action: a tap before the page has loaded
 * its JavaScript (a slow phone opening a link from an email) still posts.
 */
export class ActionErrorBoundary extends Component<ActionErrorBoundaryProps, ActionErrorBoundaryState> {
  state: ActionErrorBoundaryState = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): ActionErrorBoundaryState {
    return { error, failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Redirects and "not found" are Next's own signals, not failures: let them through.
    unstable_rethrow(this.state.error);
    return this.props.fallback(() => this.setState({ error: null, failed: false }));
  }
}
