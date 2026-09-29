import "server-only";
import { log } from "@/lib/log";

/**
 * Transactional email through Resend's HTTP API (the same account that sends
 * Supabase's login emails over SMTP). Optional: without RESEND_API_KEY and
 * PASSME_EMAIL_FROM nothing is sent and callers carry on.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8_000;

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text only: user-provided content never becomes HTML. */
  text: string;
  replyTo?: string | null;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSME_EMAIL_FROM);
}

/** Strips line breaks from header-bound values (subject, reply-to). */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSME_EMAIL_FROM;
  if (!apiKey || !from) return false;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: headerSafe(message.subject),
        text: message.text,
        ...(message.replyTo ? { reply_to: headerSafe(message.replyTo) } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn("email send failed", { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    log.warn("email send error", {}, error);
    return false;
  }
}
