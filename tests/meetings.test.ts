import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "@/lib/meetings/calendar";
import { cancelledEmail, confirmedEmail, declinedEmail, proposalEmail, type MeetingEmailContext } from "@/lib/meetings/emails";
import { describeWhen, describeWhere, meetingEvent, type Meeting } from "@/lib/meetings/model";
import { MAX_SLOTS, parseClose, parseConfirm, parseCounter, parseMeetingRequest } from "@/lib/meetings/schema";
import { allowedActions, applyChange, MAX_ROUNDS, meetingStage, openSlots } from "@/lib/meetings/state";
import {
  dateKey,
  formatSlot,
  formatSlotShort,
  isTimeZone,
  TIME_GROUPS,
  timeKey,
  upcomingDays,
  zonedTimeToUtc,
} from "@/lib/meetings/time";

const NOW = new Date("2026-10-02T09:00:00.000Z"); // Friday 11:00 in Madrid
const TUE_10 = "2026-10-06T08:00:00.000Z"; // Tuesday 6 Oct, 10:00 in Madrid
const TUE_12 = "2026-10-06T10:00:00.000Z";

describe("meeting times", () => {
  it("turns a wall-clock time in a zone into an instant, across daylight-saving changes", () => {
    expect(zonedTimeToUtc("2026-10-06", "10:00", "Europe/Madrid")?.toISOString()).toBe(TUE_10);
    expect(zonedTimeToUtc("2026-12-01", "10:00", "Europe/Madrid")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-06", "10:00", "America/New_York")?.toISOString()).toBe("2026-10-06T14:00:00.000Z");
    // 02:30 doesn't exist on 29 March in Madrid (clocks jump 02:00 → 03:00): it lands on 03:30.
    expect(zonedTimeToUtc("2026-03-29", "02:30", "Europe/Madrid")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedTimeToUtc("2026-13-01", "10:00", "Europe/Madrid")).toBeNull();
    expect(zonedTimeToUtc("2026-10-06", "25:00", "Europe/Madrid")).toBeNull();
    expect(zonedTimeToUtc("2026-10-06", "10:00", "Mars/Olympus")).toBeNull();
  });

  it("reads days and times back in the zone", () => {
    expect(dateKey(new Date("2026-10-06T22:30:00Z"), "Europe/Madrid")).toBe("2026-10-07");
    expect(timeKey(new Date(TUE_10), "Europe/Madrid")).toBe("10:00");
    expect(isTimeZone("Europe/Madrid")).toBe(true);
    expect(isTimeZone("nope")).toBe(false);
  });

  it("lists the coming days from today in the zone", () => {
    const days = upcomingDays(new Date("2026-10-02T23:30:00Z"), "Europe/Madrid", 5);
    // 23:30 UTC on Friday is already Saturday in Madrid.
    expect(days.map((d) => d.key)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(days.map((d) => d.label)).toEqual(["Hoy", "Mañana", "lun", "mar", "mié"]);
    expect(days[3]).toMatchObject({ day: 6, month: "oct", long: "martes, 6 de octubre" });
  });

  it("formats proposals in Spanish", () => {
    expect(formatSlot(TUE_10, "Europe/Madrid")).toBe("martes, 6 de octubre, 10:00");
    expect(formatSlotShort(TUE_10, "Europe/Madrid")).toBe("mar 6 oct · 10:00");
    expect(describeWhen(TUE_10, 45, "Europe/Madrid")).toBe("martes, 6 de octubre · 10:00–10:45 (hora de Madrid)");
    expect(TIME_GROUPS.flatMap((g) => g.times)).toHaveLength(22);
  });
});

const proposal = {
  slots: [TUE_12, TUE_10, TUE_10],
  duration: "30",
  format: "in_person",
  location: "  Café   Central ",
  timeZone: "Europe/Madrid",
  name: " Marta  Gil ",
  email: "Marta@Example.com",
  phone: "",
  company: "Mirador",
  topic: "Un café",
  consent: true,
};

describe("meeting request validation", () => {
  it("normalizes a proposal: sorted unique times, canonical contacts", () => {
    const result = parseMeetingRequest(proposal, NOW);
    expect(result).toEqual({
      ok: true,
      data: {
        slots: [TUE_10, TUE_12],
        duration: 30,
        format: "in_person",
        location: "Café Central",
        timeZone: "Europe/Madrid",
        name: "Marta Gil",
        email: "marta@example.com",
        phone: null,
        company: "Mirador",
        topic: "Un café",
        consent: true,
      },
    });
  });

  it("needs times, a name, an email and consent", () => {
    const result = parseMeetingRequest({ ...proposal, slots: [], name: "", email: "", consent: false }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["consent", "email", "name", "slots"]);
    expect(result.errors.email).toBe("Necesitamos tu email para enviarte la invitación.");
  });

  it("rejects past, far, odd or too many times", () => {
    const errorFor = (slots: string[]) => {
      const result = parseMeetingRequest({ ...proposal, slots }, NOW);
      return result.ok ? null : result.errors.slots;
    };
    expect(errorFor(["2026-10-01T08:00:00.000Z"])).toBe("Alguna hora ya ha pasado. Elige otra.");
    expect(errorFor(["2027-01-05T08:00:00.000Z"])).toMatch(/próximos 60 días/);
    expect(errorFor(["2026-10-06T08:07:00.000Z"])).toBe("Alguna hora no es válida.");
    expect(errorFor(["mañana"])).toBe("Alguna hora no es válida.");
    expect(errorFor(["2026-10-06T08:00:00.000Z", "2026-10-06T09:00:00.000Z", "2026-10-07T08:00:00.000Z", "2026-10-08T08:00:00.000Z"])).toBe(
      `Propón como mucho ${MAX_SLOTS} horas.`,
    );
  });

  it("keeps links, domains and phone numbers out of anything that can reach an inbox", () => {
    const linked = parseMeetingRequest({ ...proposal, name: "Gana dinero en www.spam.example", company: "https://x.example" }, NOW);
    expect(linked.ok).toBe(false);
    if (!linked.ok) expect(Object.keys(linked.errors).sort()).toEqual(["company", "name"]);

    const sneaky = parseMeetingRequest(
      { ...proposal, name: "Paga en evil.com", company: "bit.ly/3xYz", location: "Llama ya 900 123 456", topic: "visita evil.com" },
      NOW,
    );
    expect(sneaky.ok).toBe(false);
    if (!sneaky.ok) expect(Object.keys(sneaky.errors).sort()).toEqual(["company", "location", "name", "topic"]);
    // Real names and places still pass.
    for (const name of ["María José O'Connor", "Jean-Luc Picard", "Mª Ángeles Ruiz", "J. R. Martín"]) {
      expect(parseMeetingRequest({ ...proposal, name }, NOW).ok, name).toBe(true);
    }
    expect(parseMeetingRequest({ ...proposal, name: "Agente 007" }, NOW).ok).toBe(false);
    expect(parseMeetingRequest({ ...proposal, location: "Calle Mayor 12, 28013 Madrid" }, NOW).ok).toBe(true);
    // Invisible and bidirectional characters are stripped.
    const hidden = parseMeetingRequest({ ...proposal, name: "Mar​ta‮ Gil" }, NOW);
    expect(hidden.ok && hidden.data.name).toBe("Marta Gil");
  });

  it("asks a phone for calls, drops places for remote meetings and canonicalizes the zone", () => {

    const call = parseMeetingRequest({ ...proposal, format: "phone" }, NOW);
    expect(call.ok).toBe(false);
    if (!call.ok) expect(call.errors.phone).toBe("Para una llamada, deja tu teléfono.");

    const video = parseMeetingRequest({ ...proposal, format: "video" }, NOW);
    expect(video.ok && video.data.location).toBe("");
    expect(parseMeetingRequest({ ...proposal, duration: "90" }, NOW).ok).toBe(false);
    expect(parseMeetingRequest({ ...proposal, format: "dinner" }, NOW).ok).toBe(false);
    expect(parseMeetingRequest({ ...proposal, email: "x?bcc=evil@example.com" }, NOW).ok).toBe(false);
    // An unknown zone falls back to Madrid instead of failing; a known one is stored canonically.
    const zone = parseMeetingRequest({ ...proposal, timeZone: "Mars/Olympus" }, NOW);
    expect(zone.ok && zone.data.timeZone).toBe("Europe/Madrid");
    const lower = parseMeetingRequest({ ...proposal, timeZone: "america/new_york" }, NOW);
    expect(lower.ok && lower.data.timeZone).toBe("America/New_York");
  });

  it("validates answers", () => {
    expect(parseConfirm({ slot: TUE_10, location: "meet.google.com/abc-defg-hij" }, "video")).toEqual({
      ok: true,
      data: { slot: TUE_10, location: "https://meet.google.com/abc-defg-hij" },
    });
    expect(parseConfirm({ slot: TUE_10, location: "javascript:alert(1)" }, "video").ok).toBe(false);
    // Only known video services: no lookalike pages in an invitation.
    expect(parseConfirm({ slot: TUE_10, location: "https://us02web.zoom.us/j/123" }, "video").ok).toBe(true);
    expect(parseConfirm({ slot: TUE_10, location: "https://meet.google.com.evil.example/x" }, "video").ok).toBe(false);
    expect(parseConfirm({ slot: TUE_10, location: "http://meet.google.com/x" }, "video").ok).toBe(true);
    expect(parseConfirm({ slot: TUE_10, location: "Café en evil.com" }, "in_person").ok).toBe(false);
    expect(parseClose({ note: "Mira https://evil.example" }).ok).toBe(false);
    expect(parseConfirm({ slot: TUE_10, location: "anything" }, "phone")).toEqual({ ok: true, data: { slot: TUE_10, location: "" } });
    expect(parseCounter({ slots: [TUE_12], note: " Mejor\r\n\r\n\r\na mediodía " }, NOW)).toEqual({
      ok: true,
      data: { slots: [TUE_12], note: "Mejor\n\na mediodía" },
    });
    expect(parseClose({ note: "x".repeat(301) }).ok).toBe(false);
  });
});

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    status: "pending",
    proposedBy: "guest",
    slots: [TUE_10, TUE_12],
    confirmedStart: null,
    durationMinutes: 30,
    sequence: 0,
    format: "in_person",
    location: "Café Central",
    timeZone: "Europe/Madrid",
    topic: "Un café",
    guest: { name: "Marta Gil", email: "marta@example.com", phone: "+34 600 000 000", company: "Mirador" },
    responseNote: "",
    closedBy: null,
    source: "qr",
    createdAt: "2026-10-02T08:00:00.000Z",
    updatedAt: "2026-10-02T08:00:00.000Z",
    ...overrides,
  };
}

describe("meeting state", () => {
  it("lets the side that didn't propose answer, and the proposer withdraw", () => {
    const m = meeting();
    expect(meetingStage(m, NOW)).toBe("awaiting");
    expect(allowedActions(m, "owner", NOW)).toEqual(["confirm", "counter", "decline"]);
    expect(allowedActions(m, "guest", NOW)).toEqual(["cancel"]);
    expect(allowedActions(meeting({ sequence: MAX_ROUNDS }), "owner", NOW)).toEqual(["confirm", "decline"]);
  });

  it("expires proposals whose times have passed and marks meetings that took place", () => {
    const later = new Date("2026-10-06T10:30:00.000Z");
    expect(openSlots(meeting(), later)).toEqual([]);
    expect(meetingStage(meeting(), later)).toBe("expired");
    expect(allowedActions(meeting(), "owner", later)).toEqual([]);
    const confirmed = meeting({ status: "confirmed", confirmedStart: TUE_10 });
    expect(meetingStage(confirmed, NOW)).toBe("confirmed");
    expect(meetingStage(confirmed, new Date("2026-10-06T08:29:00.000Z"))).toBe("confirmed");
    expect(meetingStage(confirmed, new Date("2026-10-06T08:31:00.000Z"))).toBe("past");
    expect(allowedActions(confirmed, "guest", NOW)).toEqual(["cancel"]);
  });

  it("produces the patch for each answer", () => {
    expect(applyChange(meeting(), "owner", { action: "confirm", slot: TUE_12 }, NOW)).toEqual({
      ok: true,
      patch: { status: "confirmed", confirmed_start: TUE_12, response_note: "", closed_by: null, sequence: 1 },
    });
    expect(applyChange(meeting(), "owner", { action: "confirm", slot: "2026-10-09T08:00:00.000Z" }, NOW)).toEqual({
      ok: false,
      error: "Esa hora ya no está disponible.",
    });
    expect(applyChange(meeting(), "owner", { action: "counter", slots: [TUE_12], note: "Mejor así" }, NOW)).toEqual({
      ok: true,
      patch: { status: "pending", proposed_by: "owner", slots: [TUE_12], response_note: "Mejor así", sequence: 1 },
    });
    expect(applyChange(meeting(), "owner", { action: "decline", note: "" }, NOW)).toMatchObject({
      ok: true,
      patch: { status: "declined", closed_by: "owner" },
    });
    // The guest can't confirm their own proposal.
    expect(applyChange(meeting(), "guest", { action: "confirm", slot: TUE_10 }, NOW).ok).toBe(false);
    expect(applyChange(meeting({ status: "declined" }), "guest", { action: "cancel", note: "" }, NOW).ok).toBe(false);
  });
});

const event: CalendarEvent = {
  uid: "abc@getpassme.com",
  sequence: 2,
  start: TUE_10,
  end: "2026-10-06T08:30:00.000Z",
  summary: "Reunión con Marta Gil",
  description: "Tema: café, charla; y más\nCon: Marta",
  location: "Café Central, Madrid",
  url: "https://getpassme.com/reunion/x/y",
  organizer: { name: 'Diego "El Jefe" Molina', email: "diego@example.com" },
  attendee: { name: "Marta Gil", email: "marta@example.com" },
};

describe("calendar files", () => {
  it("writes an invitation that calendars accept", () => {
    const ics = buildIcs(event, "REQUEST", NOW);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("METHOD:REQUEST");
    expect(lines).toContain("UID:abc@getpassme.com");
    expect(lines).toContain("SEQUENCE:2");
    expect(lines).toContain("DTSTART:20261006T080000Z");
    expect(lines).toContain("DTEND:20261006T083000Z");
    expect(lines).toContain("DTSTAMP:20261002T090000Z");
    expect(ics).toContain("DESCRIPTION:Tema: café\\, charla\\; y más\\nCon: Marta");
    expect(ics).toContain('ORGANIZER;CN="Diego El Jefe Molina":mailto:diego@example.com');
    expect(ics).toContain("PARTSTAT=NEEDS-ACTION");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it("publishes a plain event without attendees (what both sides get)", () => {
    const ics = buildIcs(event, "PUBLISH", NOW);
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("ORGANIZER;");
    expect(ics).not.toContain("ATTENDEE");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("never lets a line break inside a value start a new property", () => {
    const ics = buildIcs({ ...event, summary: "Hola\r\nATTENDEE:mailto:x@evil.example", location: "a\nMETHOD:CANCEL" }, "PUBLISH", NOW);
    const lines = ics.split("\r\n");
    expect(lines.filter((l) => l.startsWith("METHOD:"))).toEqual(["METHOD:PUBLISH"]);
    expect(lines.some((l) => l.startsWith("ATTENDEE"))).toBe(false);
  });

  it("cancels the same event", () => {
    const ics = buildIcs({ ...event, sequence: 3 }, "CANCEL", NOW);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).not.toContain("VALARM");
  });

  it("links to Google Calendar with the event filled in", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261006T080000Z/20261006T083000Z");
    expect(url.searchParams.get("location")).toBe("Café Central, Madrid");
  });

  it("builds each side's copy of the meeting", () => {
    const m = meeting({ status: "confirmed", confirmedStart: TUE_12, sequence: 1 });
    const owner = { name: "Diego Molina", email: "diego@example.com" };
    const forOwner = meetingEvent(m, owner, "owner", { uidDomain: "getpassme.com" });
    expect(forOwner).toMatchObject({
      uid: `${m.id}@getpassme.com`,
      summary: "Reunión con Marta Gil",
      start: TUE_12,
      end: "2026-10-06T10:30:00.000Z",
      location: "Café Central",
      // Calendars get shared: the signed link stays out of them.
      url: "",
    });
    expect(forOwner.description).toContain("marta@example.com · +34 600 000 000");
    expect(forOwner.description).toContain("Tema: Un café");
    expect(forOwner.description).not.toContain("/reunion/");
    const forGuest = meetingEvent(m, owner, "guest", { uidDomain: "getpassme.com" });
    expect(forGuest.summary).toBe("Reunión con Diego Molina");
    expect(forGuest.description).toContain("diego@example.com");
    expect(forGuest.description).not.toContain("Un café");
    expect(describeWhere(meeting({ format: "phone" }))).toBe("Llamada al +34 600 000 000");
  });
});

describe("meeting emails", () => {
  const ctx = (m: Meeting): MeetingEmailContext => ({
    meeting: m,
    owner: { name: "Diego Molina", slug: "diego", email: "diego@example.com" },
    siteUrl: "https://getpassme.com",
  });

  it("offers the owner one button per proposed time, without the visitor's free text", () => {
    const email = proposalEmail(ctx(meeting({ topic: "<b>Compra ya</b>", responseNote: "nota", location: "Sitio raro" })), "https://getpassme.com/reunion/a/b");
    expect(email.text).not.toContain("Sitio raro");
    expect(email.text).toContain("Cómo: En persona");
    expect(email.subject).toBe("Marta Gil te propone una reunión");
    expect(email.html).toContain('href="https://getpassme.com/reunion/a/b?hora=0"');
    expect(email.html).toContain("martes, 6 de octubre, 12:00");
    expect(email.html).toContain("?accion=otra");
    expect(email.html).toContain("?accion=no");
    expect(email.html).not.toContain("Compra ya");
    expect(email.text).not.toContain("Compra ya");
    expect(email.text).not.toContain("nota");
    expect(email.text).toContain("- martes, 6 de octubre, 10:00: https://getpassme.com/reunion/a/b?hora=0");
  });

  it("escapes everything that came from people", () => {
    const m = meeting({ guest: { name: "Ana <script>", email: "a@example.com", phone: null, company: "A&B" } });
    const email = proposalEmail(ctx(m), "https://getpassme.com/reunion/a/b");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Ana &lt;script&gt;");
    expect(email.html).toContain("A&amp;B");
  });

  it("keeps notes off the visitor's unverified inbox, and passes the visitor's to an owner who engaged", () => {
    const counter = meeting({ proposedBy: "owner", sequence: 1, slots: [TUE_12], responseNote: "Mejor a mediodía" });
    const toGuest = proposalEmail(ctx(counter), "https://getpassme.com/reunion/a/c");
    expect(toGuest.subject).toBe("Diego Molina te propone otra hora");
    expect(toGuest.text).not.toContain("Mejor a mediodía");
    expect(toGuest.text).toContain("Te ha dejado un mensaje");
    expect(toGuest.text).toContain("Si no has sido tú, ignora este correo.");

    const back = meeting({ proposedBy: "guest", sequence: 2, slots: [TUE_12], responseNote: "Mejor el martes" });
    expect(proposalEmail(ctx(back), "https://getpassme.com/reunion/a/b").text).toContain("Mejor el martes");
  });

  it("doesn't put a card name that looks like a link into a stranger's inbox", () => {
    const m = meeting({ proposedBy: "owner", sequence: 1, slots: [TUE_12] });
    const email = proposalEmail({ ...ctx(m), owner: { name: "Gana en evil.com", slug: "x", email: null } }, "https://getpassme.com/reunion/a/c");
    expect(email.subject).toBe("Tu contacto de PassMe te propone otra hora");
    expect(email.text).not.toContain("evil.com");
  });

  it("confirms with the details and the other person's contact", () => {
    const m = meeting({ status: "confirmed", confirmedStart: TUE_10, sequence: 1 });
    const links = { manage: "https://getpassme.com/reunion/a/g", googleCalendar: "https://calendar.google.com/x" };
    const toGuest = confirmedEmail(ctx(m), "guest", links);
    expect(toGuest.subject).toBe("Confirmada: reunión con Diego Molina el martes 6 de octubre a las 10:00");
    expect(toGuest.text).toContain("Contacto: diego@example.com");
    expect(toGuest.text).toContain("Cuándo: martes, 6 de octubre · 10:00–10:30 (hora de Madrid)");
    expect(toGuest.text).not.toContain("Un café");
    const toOwner = confirmedEmail(ctx(m), "owner", links);
    expect(toOwner.text).toContain("Contacto: marta@example.com · +34 600 000 000");
    expect(toOwner.text).toContain("Tema: Un café");
  });

  it("tells the proposer about declines and the other side about cancellations", () => {
    const declined = declinedEmail(ctx(meeting({ status: "declined", closedBy: "owner", responseNote: "Esa semana viajo" })), {
      respond: "https://getpassme.com/reunion/a/g",
    });
    expect(declined.subject).toBe("Diego Molina no puede en esas fechas");
    // The owner's note waits on the visitor's page.
    expect(declined.text).not.toContain("Esa semana viajo");
    expect(declined.text).toContain("Ver la respuesta: https://getpassme.com/reunion/a/g");

    const byGuest = declinedEmail(ctx(meeting({ status: "declined", proposedBy: "owner", closedBy: "guest", responseNote: "Ese día no" })), {
      respond: "https://getpassme.com/reunion/a/b",
    });
    expect(byGuest.text).toContain("Ese día no");

    const withdrawn = cancelledEmail(ctx(meeting({ status: "cancelled", closedBy: "guest", responseNote: "spam" })), {
      wasConfirmed: false,
      showNote: false,
    });
    expect(withdrawn.subject).toBe("Marta Gil ha retirado su propuesta de reunión");
    expect(withdrawn.text).not.toContain("spam");

    const cancelled = cancelledEmail(ctx(meeting({ status: "cancelled", closedBy: "owner", confirmedStart: TUE_10 })), {
      wasConfirmed: true,
      showNote: true,
    });
    expect(cancelled.subject).toBe("Cancelada: reunión con Diego Molina el martes 6 de octubre a las 10:00");
  });
});

describe("meeting links", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("signs one link per side and rejects anything else", async () => {
    vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getpassme.com");
    const { meetingPath, meetingSignature, meetingUrl, verifyMeetingSignature } = await import("@/lib/meetings/links");
    const id = "11111111-2222-4333-8444-555555555555";
    const owner = meetingSignature(id, "owner")!;
    const guest = meetingSignature(id, "guest")!;
    expect(owner).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(owner).not.toBe(guest);
    expect(verifyMeetingSignature(id, owner)).toBe("owner");
    expect(verifyMeetingSignature(id.toUpperCase(), guest)).toBe("guest");
    expect(verifyMeetingSignature("11111111-2222-4333-8444-555555555556", owner)).toBeNull();
    expect(verifyMeetingSignature(id, `${owner.slice(0, -1)}A`)).toBeNull();
    expect(verifyMeetingSignature("../etc", owner)).toBeNull();
    expect(meetingPath(id, "guest")).toBe(`/reunion/${id}/${guest}`);
    expect(meetingUrl(id, "owner")).toBe(`https://getpassme.com/reunion/${id}/${owner}`);

    vi.stubEnv("PASSME_SIGNING_SECRET", "t".repeat(40));
    expect(verifyMeetingSignature(id, owner)).toBeNull();
    vi.stubEnv("PASSME_SIGNING_SECRET", "");
    expect(meetingSignature(id, "owner")).toBeNull();
  });
});
