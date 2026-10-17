/**
 * What may reach someone's inbox through a form anyone can fill in: no links,
 * emails, domains or phone numbers in free text. Plain code, no zod, so the
 * model (which decides whether an owner's name is safe to put in an email) can
 * use it from client components without the validation library. ./schema
 * re-exports everything here.
 */

/**
 * Generic TLDs that spam uses, plus every country code. "Expo.Pack", "S.L." or
 * "EE.UU." are plain text; "evil.com" or "bit.ly" are links an email client
 * would make clickable.
 */
const GENERIC_TLDS =
  "com|net|org|info|biz|edu|gov|int|mil|app|dev|xyz|online|site|website|store|shop|club|top|link|live|tech|pro|name|mobi|art|blog|cloud|page|email|click|icu|vip|win|bid|life|world|today|news|space|fun|cat|eus|gal|madrid|barcelona|bcn|" +
  // Cheap new gTLDs that phishing favours.
  "zip|mov|lol|ninja|cyou|sbs|buzz|support|monster|rest|bond|cfd|quest|beauty|work|loan|download|review|stream|party|science|date|faith|trade|men|kim|gdn";
const COUNTRY_TLDS =
  "ac|ad|ae|af|ag|ai|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|eu|fi|fj|fk|fm|fo|fr|ga|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sk|sl|sm|sn|so|sr|ss|st|su|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|uk|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|za|zm|zw";
/**
 * Links have no business in text a form anyone can fill sends to an inbox: a
 * scheme, "www.", an email, a domain followed by a path, or a known TLD that
 * ends the word.
 */
const LINKISH_RE = new RegExp(
  String.raw`https?:|www\.|:\/\/|@|[\p{L}\d-]\.[\p{L}\d-]+\/|[\p{L}\d-]\.(?:${GENERIC_TLDS}|${COUNTRY_TLDS})(?![\p{L}\d])`,
  "iu",
);
/** Nine or more digits, maybe split by single spaces, dots or dashes: a phone number. */
const PHONEISH_RE = /\d(?:[\s.-]?\d){8,}/;
/**
 * Dates (27-10-2026, 27/10/2026) and times (10:30, 10h30) are not phone numbers.
 * No lookbehind: Safari before 16.4 refuses to even parse a script that has one
 * (tests/no-lookbehind.test.ts keeps them out of the code the browser can reach).
 * The first group is "start of text or one non-digit", which is what a negative
 * lookbehind for a digit used to assert; blankOut() puts it back, so the matches
 * are the same as before.
 */
const DATE_RE = /(^|\D)((?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2})(?!\d)/g;
const TIME_RE = /(^|\D)((?:[01]?\d|2[0-3])[:h][0-5]\d)(?!\d)/g;
/** Letters, marks and the punctuation real names use (O'Connor, Jean-Luc, Mª José, J. R., Marta (Aranda)). */
export const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .,'’()-]*$/u;
const FRAGMENT_MAX = 40;

/** Dot lookalikes (ideographic and halfwidth full stops, one dot leader, fullwidth full stop) that read as "." to a person. */
const LOOKALIKE_DOTS_RE = /[\u3002\u2024\uFF0E\uFF61]/g;
/** "[.]", "(dot)" and "[dot]": the usual ways to write a link so that a filter misses it. */
const SPELLED_DOT_RE = /\[\s*\.\s*\]|\(\s*dot\s*\)|\[\s*dot\s*\]/gi;

/**
 * The text as the link and phone checks should read it: NFKC (fullwidth letters,
 * digits and "＠" become plain ones), lookalike dots and spelled-out dots become ".".
 * Plain text such as "Expo.Pack" or "S.L." comes out unchanged.
 */
export function foldForLinkCheck(s: string): string {
  // Invisible format characters (soft hyphen, zero-width joiners, word joiner) can hide inside "evil.com".
  return s.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(LOOKALIKE_DOTS_RE, ".").replace(SPELLED_DOT_RE, ".");
}

/** Replaces what DATE_RE / TIME_RE found by spaces of the same length (the leading non-digit stays). */
const blankOut = (_match: string, before: string, found: string) => before + " ".repeat(found.length);

/** Spaces in place of dates and times, so a "10:30" can't add up to a phone number. Same length as `s`. */
export function blankDatesAndTimes(s: string): string {
  return s.replace(DATE_RE, blankOut).replace(TIME_RE, blankOut);
}

export const noLinks = (s: string) => !LINKISH_RE.test(foldForLinkCheck(s));

/** The whole word around a match, without trailing punctuation, to quote it back. */
function wordAt(s: string, start: number, end: number): string {
  const from = s.slice(0, start).search(/\S*$/);
  const tail = s.slice(end).match(/^\S*/)?.[0] ?? "";
  const word = (s.slice(from, end) + tail).replace(/[.,;:!?)»”"']+$/u, "");
  return word.length > FRAGMENT_MAX ? `${word.slice(0, FRAGMENT_MAX - 1)}…` : word;
}

/**
 * Why a free text can't reach someone's inbox (a link, an email or a phone
 * number), quoting the fragment so the visitor knows what to change; null when
 * it's fine.
 */
export function unsafeTextReason(raw: string): string | null {
  // Read it the way a person (or a mail client) would: fullwidth letters and lookalike dots included.
  const s = foldForLinkCheck(raw);
  const link = LINKISH_RE.exec(s);
  if (link) {
    const fragment = wordAt(s, link.index, link.index + link[0].length);
    return fragment.includes("@")
      ? `“${fragment}” parece un email. Si es el tuyo, ponlo en su campo.`
      : `“${fragment}” parece un enlace. Escríbelo sin el punto.`;
  }
  // Blank dates and times out (same length, so indexes still match the text).
  const digitsOnly = blankDatesAndTimes(s);
  const phone = PHONEISH_RE.exec(digitsOnly);
  if (phone) return `“${phone[0].trim()}” parece un teléfono: ponlo en su campo.`;
  return null;
}

/** Free text that may reach someone's inbox: no links, emails, domains or phone numbers. */
export function isSafeText(s: string): boolean {
  return unsafeTextReason(s) === null;
}

export function isSafeName(s: string): boolean {
  return NAME_RE.test(s) && isSafeText(s);
}
