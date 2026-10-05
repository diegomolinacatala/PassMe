/**
 * "Mandarle mi tarjeta a Alex": right after creating a card from someone
 * else's, the newcomer can leave their details on it with one tap. Those
 * details come from their own saved card (server side, never from the
 * browser), and only what the card shows: a hidden email or phone stays hidden.
 */
import type { CardLink } from "./types";

export interface SendCardSource {
  fullName: string;
  company: string;
  links: ReadonlyArray<CardLink>;
}

/** What lands in the other person's "Contactos recibidos" (validated again by parseContactRequest). */
export interface SendCardDetails {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
}

function firstVisible(links: ReadonlyArray<CardLink>, kinds: ReadonlyArray<CardLink["kind"]>): string {
  for (const kind of kinds) {
    const link = links.find((l) => l.kind === kind && l.visible && l.value.trim());
    if (link) return link.value;
  }
  return "";
}

/**
 * The email is the card's visible one; the sign-in email (already verified)
 * stands in only when the card has no email at all, never for a hidden one.
 */
export function sendCardDetails(card: SendCardSource, accountEmail: string | null, cardUrl: string): SendCardDetails {
  const hasEmail = card.links.some((l) => l.kind === "email");
  return {
    name: card.fullName,
    email: firstVisible(card.links, ["email"]) || (hasEmail ? "" : (accountEmail ?? "")),
    phone: firstVisible(card.links, ["phone", "whatsapp"]),
    company: card.company,
    message: `Ha creado su tarjeta de PassMe desde la tuya.\nEsta es: ${cardUrl}`,
  };
}

/** A contact request needs an email or a phone: without either, the card is shared another way. */
export function canSendCard(details: Pick<SendCardDetails, "email" | "phone">): boolean {
  return Boolean(details.email || details.phone);
}

/** "Alex verá tu nombre, tu email y tu móvil." — exactly what will be sent. */
export function sentDetailsSentence(firstName: string, details: Pick<SendCardDetails, "email" | "phone">): string {
  const parts = ["tu nombre", details.email ? "tu email" : null, details.phone ? "tu móvil" : null].filter(
    (part): part is string => part !== null,
  );
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0];
  return `${firstName} verá ${list}.`;
}
