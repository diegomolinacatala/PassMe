/**
 * "¿Querías decir carlos@gmail.com?": a code sent to `gmial.com` never
 * arrives, and one sent to a mistyped but real address creates a second
 * account. Only a short list of unmistakable slips of the big providers —
 * anything else is left alone (it may well be a real company domain).
 */

const TYPO_DOMAINS: Readonly<Record<string, string>> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.es": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmial.es": "hotmail.es",
  "hotmal.es": "hotmail.es",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "outlok.es": "outlook.es",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yaho.es": "yahoo.es",
  "icloud.con": "icloud.com",
  "icloud.co": "icloud.com",
  "iclod.com": "icloud.com",
};

export interface EmailSuggestion {
  /** The whole corrected address, as it should be typed in. */
  email: string;
  /** What comes before the @, as typed. */
  local: string;
  /** The corrected domain (shown in bold). */
  domain: string;
}

/** The likely intended address when the domain is a known typo, or null. */
export function suggestEmailFix(raw: string): EmailSuggestion | null {
  const email = raw.trim();
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = TYPO_DOMAINS[email.slice(at + 1).toLowerCase()];
  if (!domain || /[\s@]/.test(local)) return null;
  return { email: `${local}@${domain}`, local, domain };
}
