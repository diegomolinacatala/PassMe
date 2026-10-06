import { describe, expect, it } from "vitest";
import { parseCardInput } from "@/lib/card/schema";
import { legalSectionId, PRIVACY_SUMMARY } from "@/lib/legal";
import { confirmedEmail, proposalEmail, type MeetingEmailContext } from "@/lib/meetings/emails";
import { describeWhen, type Meeting } from "@/lib/meetings/model";
import {
  DEFAULT_MEETING_SETTINGS,
  meetingSettingsSchema,
  parseMeetingSettings,
  proposalOutsideRules,
  rulesOf,
  slotAllowed,
} from "@/lib/meetings/settings";
import { otherZoneTime, timeZoneLabel } from "@/lib/meetings/time";
import { toMeetingView } from "@/lib/meetings/view";

/** UX audit P8: owner time zone (P8.1), meeting settings (P8.4) and legal pages (P8.7). */

const NOW = new Date("2026-10-05T07:00:00.000Z"); // Monday 9:00 in Madrid
const TUE_10_MADRID = "2026-10-06T08:00:00.000Z"; // Tuesday 10:00 in Madrid, 9:00 in the Canaries
const SAT_10_MADRID = "2026-10-10T08:00:00.000Z";
const TUE_14_MADRID = "2026-10-06T12:00:00.000Z";
const TUE_1330_MADRID = "2026-10-06T11:30:00.000Z";

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    status: "pending",
    proposedBy: "guest",
    slots: [TUE_10_MADRID],
    confirmedStart: null,
    durationMinutes: 30,
    sequence: 0,
    format: "video",
    location: "",
    timeZone: "Atlantic/Canary",
    topic: "",
    guest: { name: "Marta Gil", email: "marta@example.com", phone: null, company: "" },
    responseNote: "",
    closedBy: null,
    source: "qr",
    createdAt: "2026-10-05T07:00:00.000Z",
    updatedAt: "2026-10-05T07:00:00.000Z",
    ...overrides,
  };
}

describe("P8.1 time zones in Spanish", () => {
  it("names zones in Spanish, never in English", () => {
    expect(timeZoneLabel("Europe/Madrid")).toBe("hora de Madrid");
    expect(timeZoneLabel("Atlantic/Canary")).toBe("hora de Canarias");
    expect(timeZoneLabel("America/New_York")).toBe("hora de Nueva York");
    expect(timeZoneLabel("America/Mexico_City")).toBe("hora de Ciudad de México");
    expect(timeZoneLabel("Europe/London")).toBe("hora de Londres");
    expect(timeZoneLabel("Europe/Lisbon")).toBe("hora de Lisboa");
    // Outside the list, Intl's Spanish name.
    expect(timeZoneLabel("Asia/Kolkata")).not.toMatch(/Kolkata|Calcutta|India Standard/);
  });

  it("adds the other side's clock only when it reads differently", () => {
    expect(describeWhen(TUE_10_MADRID, 30, "Europe/Madrid", "Atlantic/Canary")).toBe(
      "martes, 6 de octubre · 10:00–10:30 (hora de Madrid; 09:00, hora de Canarias)",
    );
    expect(describeWhen(TUE_10_MADRID, 30, "Europe/Madrid", "Europe/Madrid")).toBe("martes, 6 de octubre · 10:00–10:30 (hora de Madrid)");
    expect(otherZoneTime(TUE_10_MADRID, "Europe/Madrid", "Africa/Ceuta")).toBeNull();
    // Another day over there: the day goes too.
    expect(otherZoneTime("2026-10-06T03:30:00.000Z", "Europe/Madrid", "America/New_York")).toBe("lun 5 oct · 23:30, hora de Nueva York");
  });

  it("emails: the owner reads Madrid (with the Canaries in brackets), the visitor the Canaries", () => {
    const ctx: MeetingEmailContext = {
      meeting: meeting(),
      owner: { name: "Alex Rivera", slug: "alex", email: "alex@example.com", timeZone: "Europe/Madrid" },
      siteUrl: "https://getpassme.com",
    };
    const toOwner = proposalEmail(ctx, "https://getpassme.com/reunion/x/y");
    expect(toOwner.html).toContain("mar 6 oct · 10:00–10:30");
    expect(toOwner.text).toContain("Las horas están en hora de Madrid (Marta las ve en hora de Canarias).");
    expect(toOwner.text).not.toMatch(/Canary|New York/);

    const confirmed = { ...ctx, meeting: meeting({ status: "confirmed", confirmedStart: TUE_10_MADRID }) };
    const toGuest = confirmedEmail(confirmed, "guest", { manage: "https://getpassme.com/m", googleCalendar: "https://calendar.google.com" });
    expect(toGuest.text).toContain("09:00–09:30 (hora de Canarias; 10:00, hora de Madrid)");
    expect(toGuest.subject).toContain("a las 09:00");
  });

  it("pages: each side reads its own zone; the owner's defaults only reach the owner", () => {
    const owner = { id: "o", name: "Alex Rivera", slug: "alex", email: null, timeZone: "Europe/Madrid", defaults: { videoLink: "https://meet.google.com/abc", place: "Café Central" } };
    const ownerView = toMeetingView(meeting(), owner, "owner", NOW);
    expect(ownerView).toMatchObject({ timeZone: "Europe/Madrid", otherTimeZone: "Atlantic/Canary", suggestedLocation: "https://meet.google.com/abc" });
    const guestView = toMeetingView(meeting(), owner, "guest", NOW);
    expect(guestView).toMatchObject({ timeZone: "Atlantic/Canary", otherTimeZone: "Europe/Madrid", suggestedLocation: "" });
    // Before the migration (no owner zone): both sides read the proposal's zone, as before.
    expect(toMeetingView(meeting(), { ...owner, timeZone: undefined }, "owner", NOW).timeZone).toBe("Atlantic/Canary");
  });

  it("saves the browser's zone canonically and ignores an unknown one", () => {
    const base = {
      slug: "alex-rivera",
      fullName: "Alex Rivera",
      headline: "",
      company: "",
      location: "",
      pronouns: "",
      bio: "",
      accentColor: "#EF7A4A",
      detailColor: null,
      pattern: "arco",
      patternSeed: 1,
      typeface: "moderna",
      avatarPath: null,
      isPublished: true,
      links: [],
    };
    const ok = parseCardInput({ ...base, timeZone: "europe/madrid" });
    expect(ok.ok && ok.data.timeZone).toBe("Europe/Madrid");
    const odd = parseCardInput({ ...base, timeZone: "Mars/Olympus_Mons" });
    expect(odd.ok && odd.data.timeZone).toBeUndefined();
  });
});

describe("P8.4 meeting settings", () => {
  const weekdayMornings = rulesOf({ ...DEFAULT_MEETING_SETTINGS, weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "14:00" });

  it("reads '{}' and junk as the defaults (Mon–Fri, 9:00–19:00, 30 min, 2 h)", () => {
    expect(parseMeetingSettings({})).toEqual(DEFAULT_MEETING_SETTINGS);
    expect(parseMeetingSettings(null)).toEqual(DEFAULT_MEETING_SETTINGS);
    expect(parseMeetingSettings({ formats: [], weekdays: [9], start: "19:00", end: "09:00", videoLink: "https://evil.example/zoom", place: "https://x.co" })).toEqual(
      DEFAULT_MEETING_SETTINGS,
    );
  });

  it("validates strictly on save", () => {
    const good = meetingSettingsSchema.safeParse({ ...DEFAULT_MEETING_SETTINGS, videoLink: "meet.google.com/abc-defg-hij", weekdays: [5, 1] });
    expect(good.success && good.data).toMatchObject({ videoLink: "https://meet.google.com/abc-defg-hij", weekdays: [1, 5] });
    for (const bad of [
      { formats: [] },
      { weekdays: [] },
      { start: "14:00", end: "09:00" },
      { videoLink: "https://zoom.evil.example/j/1" },
      { noticeMinutes: 7 },
      { place: "Llámame al 600 000 000" },
    ]) {
      expect(meetingSettingsSchema.safeParse({ ...DEFAULT_MEETING_SETTINGS, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("with «solo L–V 9–14», no Saturdays and no afternoons (in the owner's zone)", () => {
    expect(slotAllowed(TUE_10_MADRID, weekdayMornings, "Europe/Madrid", NOW)).toBe(true);
    expect(slotAllowed(TUE_1330_MADRID, weekdayMornings, "Europe/Madrid", NOW)).toBe(true);
    expect(slotAllowed(TUE_14_MADRID, weekdayMornings, "Europe/Madrid", NOW)).toBe(false);
    expect(slotAllowed(SAT_10_MADRID, weekdayMornings, "Europe/Madrid", NOW)).toBe(false);
    // Read in the Canaries the same instant is 9:00: still inside, but 8:30 there wouldn't be.
    expect(slotAllowed("2026-10-06T08:30:00.000Z", weekdayMornings, "Atlantic/Canary", NOW)).toBe(true);
    expect(slotAllowed("2026-10-06T07:30:00.000Z", weekdayMornings, "Atlantic/Canary", NOW)).toBe(false);
    // Minimum notice: 2 h from Monday 9:00 means not before 11:00.
    expect(slotAllowed("2026-10-05T08:30:00.000Z", weekdayMornings, "Europe/Madrid", NOW)).toBe(false);
    expect(slotAllowed("2026-10-05T09:00:00.000Z", weekdayMornings, "Europe/Madrid", NOW)).toBe(true);
  });

  it("the server refuses what the picker wouldn't offer", () => {
    const card = { fullName: "Alex Rivera", timeZone: "Europe/Madrid", meetingRules: { ...weekdayMornings, formats: ["in_person" as const, "video" as const] } };
    expect(proposalOutsideRules(card, { slots: [TUE_10_MADRID], format: "video" }, NOW)).toBeNull();
    expect(proposalOutsideRules(card, { slots: [TUE_10_MADRID], format: "phone" }, NOW)).toHaveProperty("format");
    expect(proposalOutsideRules(card, { slots: [TUE_10_MADRID, SAT_10_MADRID], format: "video" }, NOW)).toHaveProperty("slots");
    // No settings (migration pending): no extra limits.
    expect(proposalOutsideRules({ ...card, meetingRules: null }, { slots: [SAT_10_MADRID], format: "phone" }, NOW)).toBeNull();
  });
});

describe("P8.7 legal pages", () => {
  it("anchors every section from its title", () => {
    expect(legalSectionId("Qué datos guardamos")).toBe("que-datos-guardamos");
    expect(legalSectionId("Si usas «Agendar reunión»")).toBe("si-usas-agendar-reunion");
    expect(legalSectionId("Cuánto tiempo")).toBe("cuanto-tiempo");
  });

  it("summarises the policy in four bullets", () => {
    expect(PRIVACY_SUMMARY).toHaveLength(4);
  });
});
