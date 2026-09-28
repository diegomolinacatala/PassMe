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
  /** Pattern/seal/label color; null = derived from the background. */
  detailColor: string | null;
  pattern: PatternKind;
  /** Seeds the generative pattern and doubles as the card's "seal number". */
  patternSeed: number;
  avatarUrl: string | null;
  links: CardLink[];
}

/** What anonymous visitors receive: only visible links, no internal ids. */
export type PublicCard = CardData;

/** The owner's full view of their card, including hidden links. */
export interface OwnerCard extends CardData {
  id: string;
  avatarPath: string | null;
  isPublished: boolean;
  updatedAt: string;
}
