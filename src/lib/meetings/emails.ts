/**
 * The emails of "Agendar reunión". Pure builders (subject + HTML + text) so
 * they can be tested; src/lib/meetings/service.ts decides who gets which.
 *
 * Anyone can create a card, so neither side's free text is trusted with
 * someone else's inbox:
 *   - The visitor's address is unverified: emails to it carry only fixed
 *     text, the times, the format and a vetted place or video link. Notes
 *     and topics stay on the signed page.
 *   - The owner's first email (the only one an anonymous visitor can
 *     trigger) carries the times, the format and the visitor's name and
 *     company, all validated to hold no links or phone numbers. Notes reach
 *     the owner only once they have answered.
 */
import { renderEmailHtml, renderEmailText, type EmailBody } from "@/lib/email-layout";
import { describeWhen, describeWhenInline, describeWhere, displayName, formatDuration, type Meeting } from "./model";
import { FORMAT_LABELS, isSafeName } from "./schema";
import { otherParty, type MeetingParty } from "./state";
import { addMinutes, formatSlotShort, formatTime, timeZoneCity } from "./time";

export interface MeetingEmail {
  subject: string;
  html: string;
  text: string;
}

export interface MeetingEmailContext {
  meeting: Meeting;
  owner: { name: string; slug: string; email: string | null };
  siteUrl: string;
}

function render(subject: string, body: EmailBody): MeetingEmail {
  return { subject, html: renderEmailHtml(body), text: renderEmailText(body) };
}

/** Card names aren't held to the meeting rules: one that looks like a link stays out of a stranger's inbox. */
function ownerName(ctx: MeetingEmailContext): string {
  return isSafeName(ctx.owner.name) ? ctx.owner.name : "Tu contacto de PassMe";
}

function nameOf(ctx: MeetingEmailContext, party: MeetingParty): string {
  return party === "owner" ? ownerName(ctx) : ctx.meeting.guest.name;
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

function footerFor(ctx: MeetingEmailContext, recipient: MeetingParty, extra: string[] = []): string[] {
  return recipient === "owner"
    ? [
        ...extra,
        "Te llega porque tienes activado «Recibir propuestas de reunión» en tu tarjeta de PassMe.",
        `Puedes desactivarlo en tu editor: ${ctx.siteUrl}/dashboard`,
      ]
    : [
        ...extra,
        `Te llega porque alguien propuso con este email una reunión a ${ownerName(ctx)} desde su tarjeta de PassMe.`,
        "Si no has sido tú, ignora este correo.",
      ];
}

const NO_REPLY = "Este correo no admite respuestas: usa los botones.";

/** Words from `author`, only when they go to the owner (see the rules above). */
function noteFor(ctx: MeetingEmailContext, recipient: MeetingParty, author: string, allowed: boolean) {
  const { responseNote } = ctx.meeting;
  return recipient === "owner" && allowed && responseNote ? { author, text: responseNote } : undefined;
}

/**
 * A proposal waiting for `recipient` (the side that didn't make it): one
 * button per time, plus "other time" and "I can't".
 */
export function proposalEmail(ctx: MeetingEmailContext, respondUrl: string): MeetingEmail {
  const { meeting } = ctx;
  const recipient = otherParty(meeting.proposedBy);
  const proposer = nameOf(ctx, meeting.proposedBy);
  const first = meeting.sequence === 0;
  const count = meeting.slots.length;
  const subject = first ? `${proposer} te propone una reunión` : `${proposer} te propone ${count === 1 ? "otra hora" : "otras horas"}`;
  const intro = first
    ? `${displayName(meeting.guest)} vio tu tarjeta y te propone ${count === 1 ? "una hora. Tócala si te viene bien" : `${count} horas. Toca la que te venga bien`}.`
    : `${proposer} no puede a la hora que propusiste y te ofrece ${count === 1 ? "esta otra" : "estas otras"}. Elige una y os enviamos la invitación a los dos.`;

  return render(subject, {
    preheader: `${formatSlotShort(meeting.slots[0]!, meeting.timeZone)}${count > 1 ? ` y ${count - 1} más` : ""}. Confirma con un toque.`,
    eyebrow: "Agendar reunión",
    title: first ? `${proposer} quiere reunirse contigo` : subject,
    paragraphs: [
      intro,
      ...(recipient === "guest" && meeting.responseNote ? ["Te ha dejado un mensaje: lo verás al abrir cualquiera de las horas."] : []),
    ],
    // The place and the topic were typed freely: they wait on the signed page.
    details: [
      ["Cómo", FORMAT_LABELS[meeting.format]],
      ["Duración", formatDuration(meeting.durationMinutes)],
    ],
    quote: noteFor(ctx, recipient, proposer, !first),
    buttonsIntro: first ? undefined : count === 1 ? "Si te viene bien, confírmala:" : "Toca la que te venga bien:",
    // Equal choices: same outlined style, with the length in the label ("mar 6 oct · 10:00–10:30").
    equalButtons: true,
    buttons: meeting.slots.map((slot, index) => ({
      label: `${formatSlotShort(slot, meeting.timeZone)}–${formatTime(addMinutes(slot, meeting.durationMinutes), meeting.timeZone)}`,
      href: `${respondUrl}?hora=${index}`,
    })),
    links: [
      { label: "Proponer otras horas", href: `${respondUrl}?accion=otra` },
      { label: "No puedo", href: `${respondUrl}?accion=no` },
    ],
    footer: footerFor(ctx, recipient, [`Las horas son de ${timeZoneCity(meeting.timeZone)}.`, ...(recipient === "guest" ? [NO_REPLY] : [])]),
  });
}

/** The meeting is on: details, "add to calendar" and how to reach the other person. */
export function confirmedEmail(
  ctx: MeetingEmailContext,
  recipient: MeetingParty,
  links: { manage: string; googleCalendar: string },
): MeetingEmail {
  const { meeting } = ctx;
  const start = meeting.confirmedStart!;
  const other = otherParty(recipient);
  const otherName = nameOf(ctx, other);
  const contact =
    other === "guest"
      ? [meeting.guest.email, meeting.guest.phone].filter(Boolean).join(" · ")
      : (ctx.owner.email ?? "");

  const details: Array<readonly [string, string]> = [
    ["Cuándo", describeWhen(start, meeting.durationMinutes, meeting.timeZone)],
    ["Cómo", describeWhere(meeting)],
    ["Con", other === "guest" ? displayName(meeting.guest) : otherName],
  ];
  if (contact) details.push(["Contacto", contact]);
  if (meeting.topic && recipient === "owner") details.push(["Tema", meeting.topic]);

  const videoPending = meeting.format === "video" && !meeting.location;
  return render(`Confirmada: reunión con ${otherName} ${describeWhenInline(start, meeting.timeZone)}`, {
    preheader: `${formatSlotShort(start, meeting.timeZone)} con ${otherName}. La invitación va adjunta.`,
    eyebrow: "Reunión confirmada",
    title: `Hecho: ${firstName(otherName)} y tú os veis ${describeWhenInline(start, meeting.timeZone)}`,
    paragraphs: [
      "Te adjuntamos la invitación para añadirla a tu calendario (Apple Calendar, Outlook o Gmail).",
      ...(videoPending ? ["Es una videollamada: pasaos el enlace respondiendo a este correo."] : []),
    ],
    details,
    buttons: [{ label: "Añadir a Google Calendar", href: links.googleCalendar }],
    links: [{ label: "Ver o cancelar la reunión", href: links.manage }],
    footer: footerFor(ctx, recipient, [`Para cualquier cosa, responde a este correo: le llegará a ${otherName}.`]),
  });
}

/** The side that had to answer can't make any of the proposed times. */
export function declinedEmail(ctx: MeetingEmailContext, links: { respond: string }): MeetingEmail {
  const { meeting } = ctx;
  const decliner = meeting.closedBy ?? otherParty(meeting.proposedBy);
  const recipient = otherParty(decliner);
  const declinerName = nameOf(ctx, decliner);
  return render(`${declinerName} no puede en esas fechas`, {
    preheader: "No ha podido ser esta vez.",
    eyebrow: "Agendar reunión",
    title: `${firstName(declinerName)} no puede esta vez`,
    paragraphs: [
      recipient === "guest"
        ? `${declinerName} ha respondido a tu propuesta: no le viene bien ninguna de las horas. Desde la reunión puedes proponerle otras horas.`
        : `${declinerName} ha respondido a las horas que le propusiste: no le viene bien ninguna.`,
    ],
    quote: noteFor(ctx, recipient, declinerName, true),
    buttons: recipient === "guest" ? [{ label: "Ver la respuesta", href: links.respond }] : undefined,
    footer: footerFor(ctx, recipient, recipient === "guest" ? [NO_REPLY] : []),
  });
}

/**
 * A confirmed meeting (or a proposal) was called off by the other side.
 * `showNote` is false when a visitor withdraws a proposal the owner never
 * answered (see the rules above).
 */
export function cancelledEmail(ctx: MeetingEmailContext, { wasConfirmed, showNote }: { wasConfirmed: boolean; showNote: boolean }): MeetingEmail {
  const { meeting } = ctx;
  const canceller = meeting.closedBy ?? meeting.proposedBy;
  const recipient = otherParty(canceller);
  const cancellerName = nameOf(ctx, canceller);
  const start = meeting.confirmedStart ?? meeting.slots[0]!;
  return render(
    wasConfirmed
      ? `Cancelada: reunión con ${cancellerName} ${describeWhenInline(start, meeting.timeZone)}`
      : `${cancellerName} ha cancelado su propuesta de reunión`,
    {
      preheader: wasConfirmed ? "Quítala de tu calendario." : "Ya no hace falta que respondas.",
      eyebrow: wasConfirmed ? "Reunión cancelada" : "Agendar reunión",
      title: wasConfirmed ? `${firstName(cancellerName)} ha cancelado la reunión` : `${firstName(cancellerName)} ha cancelado su propuesta`,
      paragraphs: [
        wasConfirmed
          ? `La reunión ${describeWhenInline(start, meeting.timeZone)} queda cancelada. Si la añadiste a tu calendario, el archivo adjunto la quita (en Gmail, bórrala tú).`
          : "Ya no hace falta que respondas a las horas que te propuso.",
      ],
      quote: noteFor(ctx, recipient, cancellerName, showNote),
      footer: footerFor(ctx, recipient, wasConfirmed ? [`Responde a este correo para hablar con ${cancellerName}.`] : []),
    },
  );
}
