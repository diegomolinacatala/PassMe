import { describe, expect, it } from "vitest";
import { ActionErrorBoundary } from "@/components/ui/action-error-boundary";

/*
 * The boundary around a form whose Server Action may never answer: it swaps
 * only that form for its fallback, and lets Next's own signals (redirect,
 * not found) through untouched.
 */

function boundaryAfter(error: unknown) {
  const boundary = new ActionErrorBoundary({ children: "form", fallback: (retry) => ({ fallback: true, retry }) as never });
  boundary.state = ActionErrorBoundary.getDerivedStateFromError(error);
  return boundary;
}

describe("ActionErrorBoundary", () => {
  it("shows the form while nothing has failed", () => {
    const boundary = new ActionErrorBoundary({ children: "form", fallback: () => "fallback" });
    expect(boundary.render()).toBe("form");
  });

  it("replaces the form with the fallback when the action never answered", () => {
    const rendered = boundaryAfter(new TypeError("Failed to fetch")).render() as unknown as { fallback: boolean };
    expect(rendered.fallback).toBe(true);
  });

  it("lets a redirect through to Next instead of calling it a failure", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/dashboard;307;" });
    expect(() => boundaryAfter(redirect).render()).toThrow("NEXT_REDIRECT");
  });
});
