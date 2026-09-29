"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget (explicit rendering). Writes the token into a
 * hidden input named `captchaToken` so it travels with the surrounding form.
 * The script is injected from our own (nonce-approved) bundle, which the CSP
 * allows through 'strict-dynamic'; the widget iframe needs frame-src (proxy.ts).
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileProps {
  siteKey: string;
  /** Shows up in Cloudflare analytics, e.g. "login" or "contact". */
  action: string;
  /**
   * Tokens are single-use: pass something that changes after every submission
   * (e.g. the form's action state) and the widget fetches a fresh one.
   */
  resetKey?: unknown;
}

export function Turnstile({ siteKey, action, resetKey }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!widget.current || !window.turnstile) return;
    setToken("");
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId = widget.current = api.render(container.current, {
          sitekey: siteKey,
          action,
          language: "es",
          appearance: "interaction-only",
          callback: (value: string) => setToken(value),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      widget.current = null;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, action]);

  return (
    <>
      <input type="hidden" name="captchaToken" value={token} />
      <div ref={container} />
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          No se pudo cargar la verificación anti-spam. Recarga la página.
        </p>
      ) : null}
    </>
  );
}
