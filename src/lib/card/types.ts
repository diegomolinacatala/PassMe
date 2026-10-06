import type { MeetingRules, MeetingSettings } from "@/lib/meetings/settings";
import type { Typeface } from "./design";
import type { LinkKind } from "./links";
import type { PatternKind } from "./pattern";

/** A single contact entry the owner adds to their card. */
export interface CardLink {
  /** Stable client-generated id, used for ordering and click analytics. */
  id: string;
  kind: LinkKind;
  /** Normalized value (email, phone, handle or canonical URL depending on kind). */
  value: string;
  /** Optional custom title. Required for `custom` links. */
  label?: string;
  /** Hidden links are kept in the editor but never leave the server. */
  visible: boolean;
}

/** Fields shared by the public page, the wallet passes and the editor. */
export interface CardData {
  slug: string;
  fullName: string;
  headline: string;
  company: string;
  location: string;
  pronouns: string;
  bio: string;
  /** Pass background. */
  accentColor: string;
  /** Motif/frame/label color; null = derived from the background. */
  detailColor: string | null;
  pattern: PatternKind;
  /** Seeds the generative motif: the card's own variation. */
  patternSeed: number;
  /** Typeface of the name on the pass. */
  typeface: Typeface;
  avatarUrl: string | null;
  links: CardLink[];
  /** Shows the "leave your contact" form on the public card. */
  acceptsContactRequests: boolean;
  /** Shows "Agendar reunión" on the public card. */
  acceptsMeetingRequests: boolean;
  /** Owner's IANA time zone (migration 20261006120000); undefined before it, so the picker uses the visitor's. */
  timeZone?: string;
  /** What visitors may propose (public part of the meeting settings); null or undefined = no limits. */
  meetingRules?: MeetingRules | null;
}

/** What anonymous visitors receive: only visible links, no internal ids. */
export type PublicCard = CardData;

/** The owner's full view of their card, including hidden links. */
export interface OwnerCard extends CardData {
  id: string;
  avatarPath: string | null;
  isPublished: boolean;
  updatedAt: string;
  /** «Ajustes de reuniones», including the private defaults; null while the migration is pending. */
  meetingSettings?: MeetingSettings | null;
}
