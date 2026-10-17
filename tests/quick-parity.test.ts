import { z } from "zod";
import { describe, expect, it } from "vitest";
import { CARD_THEMES, DEFAULT_THEME, PATTERN_SEED_MAX, TYPEFACES } from "@/lib/card/design";
import { LIMITS } from "@/lib/card/limits";
import { normalizeLinkValue, type LinkKind } from "@/lib/card/links";
import { PATTERN_KINDS } from "@/lib/card/pattern";
import { CONTACT_ERROR_KEY, coerceQuickDraft, parseQuickDraft } from "@/lib/card/quick";
import { line, toFieldErrors } from "@/lib/card/text";

/**
 * /crear used to validate the draft with this zod schema; it now runs plain code
 * (src/lib/card/quick-form.ts) so zod stays out of the browser. This is the
 * schema as it was, kept here as the reference the plain version must agree with.
 */
function optionalLink(kind: LinkKind) {
  return z
    .string()
    .max(LIMITS.linkValue)
    .transform((raw, ctx) => {
      if (!raw.trim()) return "";
      const normalized = normalizeLinkValue(kind, raw);
      if (!normalized.ok) {
        ctx.addIssue({ code: "custom", message: normalized.error });
        return z.NEVER;
      }
      return normalized.value;
    });
}

const referenceSchema = z
  .object({
    fullName: line(LIMITS.fullName).pipe(z.string().min(1, "Tu nombre es obligatorio.")),
    headline: line(LIMITS.headline),
    company: line(LIMITS.company),
    phone: optionalLink("phone"),
    email: optionalLink("email"),
    linkedin: optionalLink("linkedin"),
    theme: z.string().transform((id) => (CARD_THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME.id)),
    patternSeed: z.number().int().min(0).max(PATTERN_SEED_MAX),
    pattern: z.enum(PATTERN_KINDS),
    typeface: z.enum(TYPEFACES),
  })
  .refine((draft) => Boolean(draft.phone || draft.email || draft.linkedin), {
    path: [CONTACT_ERROR_KEY],
    message: "Añade al menos un teléfono, un email o tu LinkedIn: es lo que guardarán de ti.",
    when: ({ value }) => typeof value === "object" && value !== null,
  });

function reference(input: unknown) {
  const result = referenceSchema.safeParse(coerceQuickDraft(input));
  return result.success ? { ok: true as const, data: result.data } : { ok: false as const, errors: toFieldErrors(result.error) };
}

const valid = { fullName: "Ana López", headline: "CTO", company: "ACME", phone: "+34 600 000 000", email: "ana@acme.es", linkedin: "linkedin.com/in/ana", theme: "cafe", patternSeed: 4821, pattern: "corriente", typeface: "cursiva" };

describe("parseQuickDraft (plain code) agrees with the zod schema it replaced", () => {
  const fixtures: Array<[string, unknown]> = [
    ["a complete draft", valid],
    ["only a name", { fullName: "Ana" }],
    ["only a phone", { phone: "600 000 000" }],
    ["nothing", {}],
    ["null", null],
    ["a number", 42],
    ["a string", "Ana"],
    ["an array", [valid]],
    ["name with control and invisible characters", { ...valid, fullName: "  Ana\u200B \u202ELópez\u0000  " }],
    ["name of only invisible characters", { ...valid, fullName: "\u200B\u200E \t" }],
    ["name over the limit once cleaned", { ...valid, fullName: "a".repeat(LIMITS.fullName + 1) }],
    ["name at the limit", { ...valid, fullName: "a".repeat(LIMITS.fullName) }],
    ["name and spaces over the raw limit", { ...valid, fullName: `${"a ".repeat(200)}` }],
    ["headline and company over the limit", { ...valid, headline: "h".repeat(LIMITS.headline + 1), company: "c".repeat(LIMITS.company + 1) }],
    ["a bad phone and nothing else", { fullName: "Ana", phone: "abc" }],
    ["a bad phone next to a good email", { ...valid, phone: "abc" }],
    ["a bad email and nothing else", { fullName: "Ana", email: "ana@" }],
    ["every contact bad", { fullName: "Ana", phone: "12", email: "x", linkedin: "https://example.com/not-linkedin" }],
    ["a bad linkedin next to a good phone", { ...valid, linkedin: "nope nope" }],
    ["whitespace-only contacts", { fullName: "Ana", phone: "   ", email: " ", linkedin: "\t" }],
    ["an email with padding and capitals", { fullName: "Ana", email: "  Ana@Acme.ES " }],
    ["a linkedin handle", { fullName: "Ana", linkedin: "ana-lopez" }],
    ["an unknown theme", { ...valid, theme: "no-such-theme" }],
    ["a retired motif", { ...valid, pattern: "orbitas" }],
    ["an unknown typeface and a bad seed", { ...valid, typeface: "comic", patternSeed: -3 }],
    ["a seed past the maximum", { ...valid, patternSeed: PATTERN_SEED_MAX + 1 }],
    ["non-string fields", { fullName: 12, headline: null, phone: {}, email: [], theme: 5 }],
    ["fields past the stored size", { ...valid, fullName: "x".repeat(500), phone: "9".repeat(600), email: `${"e".repeat(400)}@a.es` }],
  ];

  it.each(fixtures)("%s", (_label, input) => {
    expect(parseQuickDraft(input)).toEqual(reference(input));
  });

  it("agrees on random drafts built from awkward pieces", () => {
    let state = 424242;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const pick = <T,>(pool: readonly T[]) => pool[Math.floor(next() * pool.length)]!;
    const names = ["", " ", "Ana", "Ana López", "  María   José  ", "a".repeat(81), "\u200B", "Zoë\u0000Ng", "x".repeat(200)];
    const phones = ["", "600000000", "+34 600 000 000", "abc", "12", "00 34 600 000 000", "(+34) 600-000-000", "1".repeat(40)];
    const emails = ["", "ana@acme.es", "Ana@Acme.ES ", "ana@", "a b@c.es", "ana@acme", `${"e".repeat(300)}@a.es`];
    const linkedins = ["", "ana-lopez", "linkedin.com/in/ana", "https://www.linkedin.com/in/ana/", "https://example.com/x", "@@@"];
    const themes = ["cafe", "naranja", "nope", ""];
    for (let i = 0; i < 1500; i += 1) {
      const input = {
        fullName: pick(names),
        headline: pick(names),
        company: pick(names),
        phone: pick(phones),
        email: pick(emails),
        linkedin: pick(linkedins),
        theme: pick(themes),
        patternSeed: pick([0, 7, 99999, -1, 1.5, "7"]),
        pattern: pick([...PATTERN_KINDS, "orbitas", "x", 3]),
        typeface: pick([...TYPEFACES, "x", null]),
      };
      expect(parseQuickDraft(input), JSON.stringify(input)).toEqual(reference(input));
    }
  });
});
