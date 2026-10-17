import "server-only";
import { log } from "@/lib/log";

/**
 * Transactional email through Resend's HTTP API (the same account that sends
 * Supabase's login emails over SMTP). Optional: without RESEND_API_KEY and
 * PASSME_EMAIL_FROM nothing is sent and callers carry on.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8_000;

export interface EmailAttachment {
  filename: string;
  /** Text content (e.g. an .ics file); sent base64-encoded. */
  content: string;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Built only by src/lib/email-layout.ts, which escapes every value. */
  html?: string;
  replyTo?: string | null;
  attachments?: ReadonlyArray<EmailAttachment>;
  /** Extra headers (e.g. List-Unsubscribe). Line breaks are stripped; names that shape the message are refused. */
  headers?: Readonly<Record<string, string>>;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSME_EMAIL_FROM);
}

/** Strips line breaks from header-bound values (subject, reply-to). */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Headers the message itself decides (or Resend sets): callers can't override them. */
const RESERVED_HEADERS = new Set([
  "bcc",
  "cc",
  "content-transfer-encoding",
  "content-type",
  "date",
  "from",
  "message-id",
  "mime-version",
  "reply-to",
  "return-path",
  "sender",
  "subject",
  "to",
]);
const HEADER_NAME_RE = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

/** The extra headers that are safe to send: valid names, no reserved ones, no line breaks. */
export function sanitizeHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!HEADER_NAME_RE.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) continue;
    const clean = headerSafe(String(value));
    if (clean) safe[name] = clean;
  }
  return safe;
}

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      /** not_configured: no keys. rejected: Resend answered with an error. network: no answer (timeout, offline). */
      reason: "not_configured" | "rejected" | "network";
      /** Resend's HTTP status when it answered. */
      status?: number;
      error?: unknown;
    };

/**
 * Sends one email and says why it didn't go, for callers that must not fail
 * silently. Doesn't log: the caller knows what the email was for.
 */
export async function sendEmailDetailed(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSME_EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, reason: "not_configured" };

  const headers = sanitizeHeaders(message.headers);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: headerSafe(message.subject),
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: headerSafe(message.replyTo) } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: headerSafe(a.filename),
                content: Buffer.from(a.content, "utf8").toString("base64"),
                content_type: headerSafe(a.contentType),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: "rejected", status: response.status };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "network", error };
  }
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const result = await sendEmailDetailed(message);
  if (result.ok) return true;
  if (result.reason === "rejected") log.warn("email send failed", { status: result.status });
  else if (result.reason === "network") log.warn("email send error", {}, result.error);
  return false;
}
