/**
 * The look of PassMe's transactional emails, in HTML and plain text from one
 * description (same style as supabase/templates/magic-link.html). Every value
 * is escaped here: callers pass plain strings, never markup.
 */

export interface EmailButton {
  label: string;
  href: string;
}

export interface EmailLink {
  label: string;
  href: string;
}

export interface EmailBody {
  /** Hidden preview line shown next to the subject in the inbox. */
  preheader: string;
  eyebrow: string;
  title: string;
  paragraphs: ReadonlyArray<string>;
  /** Label/value rows (when, where, with whom…). */
  details?: ReadonlyArray<readonly [string, string]>;
  /** Stacked buttons (e.g. one per proposed time). The first is the main one. */
  buttons?: ReadonlyArray<EmailButton>;
  buttonsIntro?: string;
  /** Smaller text links under the buttons. */
  links?: ReadonlyArray<EmailLink>;
  /** Quoted words from a person (a note). */
  quote?: { author: string; text: string };
  footer: ReadonlyArray<string>;
}

const INK = "#221b17";
const INK_SOFT = "#463b33";
const MUTED = "#6a5f55";
const PAPER = "#f3efe6";
const CARD = "#fbf9f4";
const LINE = "#dbd2c3";
const SIGNAL = "#c24e1c";
const GLOW = "#f6c6a6";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only our own absolute https links (and mailto/tel) ever become hrefs. */
function safeHref(href: string): string {
  return /^(https?:|mailto:|tel:)/i.test(href) ? escapeHtml(href) : "#";
}

const multiline = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");

function button({ label, href }: EmailButton, primary: boolean): string {
  const style = primary
    ? `background:${SIGNAL};color:#ffffff;border:1px solid ${SIGNAL};`
    : `background:${CARD};color:${INK};border:1px solid ${INK};`;
  return `<tr><td style="padding:0 0 10px;"><a href="${safeHref(href)}" style="display:block;${style}text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:13px 20px;border-radius:999px;text-align:center;">${escapeHtml(label)}</a></td></tr>`;
}

export function renderEmailHtml(body: EmailBody): string {
  const paragraphs = body.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${INK_SOFT};">${multiline(p)}</p>`)
    .join("");

  const details = body.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;border-top:1px solid ${LINE};">${body.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:11px 0;border-bottom:1px solid ${LINE};vertical-align:top;width:34%;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td><td style="padding:11px 0 11px 12px;border-bottom:1px solid ${LINE};vertical-align:top;font-size:15px;line-height:1.45;color:${INK};">${multiline(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const quote = body.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td style="border-left:3px solid ${GLOW};padding:4px 0 4px 14px;"><p style="margin:0 0 4px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${escapeHtml(body.quote.author)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:${INK};">${multiline(body.quote.text)}</p></td></tr></table>`
    : "";

  const buttons = body.buttons?.length
    ? `${body.buttonsIntro ? `<p style="margin:6px 0 12px;font-size:14px;color:${MUTED};">${escapeHtml(body.buttonsIntro)}</p>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body.buttons
        .map((b, i) => button(b, i === 0))
        .join("")}</table>`
    : "";

  const links = body.links?.length
    ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:${MUTED};">${body.links
        .map((l) => `<a href="${safeHref(l.href)}" style="color:${SIGNAL};text-decoration:underline;">${escapeHtml(l.label)}</a>`)
        .join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  const footer = body.footer
    .map((f) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED};">${multiline(f)}</p>`)
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(body.title)}</title></head><body style="margin:0;padding:0;background:${PAPER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(body.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD};border-radius:24px;overflow:hidden;"><tr><td style="background:${INK};padding:22px 32px;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${PAPER};">Pass<em style="color:${GLOW};">Me</em></span></td></tr><tr><td style="padding:32px 32px 28px;"><p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${escapeHtml(body.eyebrow)}</p><h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.15;color:${INK};">${escapeHtml(body.title)}</h1>${paragraphs}${details}${quote}${buttons}${links}</td></tr><tr><td style="padding:18px 32px 26px;border-top:1px solid ${LINE};">${footer}</td></tr></table></td></tr></table></body></html>`;
}

/** The same email as plain text (for clients that don't show HTML, and for spam filters). */
export function renderEmailText(body: EmailBody): string {
  const out: string[] = [body.title, "", ...body.paragraphs.flatMap((p) => [p, ""])];
  if (body.details?.length) {
    for (const [label, value] of body.details) out.push(`${label}: ${value}`);
    out.push("");
  }
  if (body.quote) out.push(`${body.quote.author}: «${body.quote.text}»`, "");
  if (body.buttons?.length) {
    if (body.buttonsIntro) out.push(body.buttonsIntro);
    for (const b of body.buttons) out.push(`- ${b.label}: ${b.href}`);
    out.push("");
  }
  for (const l of body.links ?? []) out.push(`${l.label}: ${l.href}`);
  if (body.links?.length) out.push("");
  out.push("—", ...body.footer);
  return out.join("\n");
}
