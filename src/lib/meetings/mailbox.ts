import { domainToASCII } from "node:url";

/**
 * One key per real mailbox, for the per-address email caps. People can write
 * the same inbox many ways (Gmail ignores dots and "+tag"; most providers
 * ignore "+tag"; letters can come in fullwidth or mixed case), and each way
 * would otherwise count as a fresh address and dodge the cap.
 *
 * It only ever keys a counter: the email itself is sent to the address as typed.
 */
export function mailboxKey(address: string): string {
  const normalized = address.normalize("NFKC").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return normalized;

  const rawHost = normalized.slice(at + 1);
  // IDN and lookalike dots (U+3002…) settle to one ASCII form; an unparseable host stays as typed.
  const host = domainToASCII(rawHost) || rawHost;
  const canonicalHost = host === "googlemail.com" ? "gmail.com" : host;

  let local = normalized.slice(0, at);
  const tag = local.indexOf("+");
  // "+tag@x.com" has no name before the tag: keep it whole rather than collapse unrelated tags together.
  if (tag > 0) local = local.slice(0, tag);
  if (canonicalHost === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${canonicalHost}`;
}
