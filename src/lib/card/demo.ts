import type { ContactRequest } from "./contact";
import { DEFAULT_MEETING_SETTINGS, rulesOf, type MeetingSettings } from "@/lib/meetings/settings";
import type { OwnerCard } from "./types";

/**
 * Fictional sample card served at /u/demo and used as the editor's starting
 * point in demo mode (no Supabase configured). Uses example.com-style data only.
 */
export const DEMO_SLUG = "demo";

const DEMO_MEETING_SETTINGS: MeetingSettings = {
  ...DEFAULT_MEETING_SETTINGS,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  start: "08:00",
  end: "21:00",
  noticeMinutes: 0,
};

export const DEMO_CARD: OwnerCard = {
  id: "00000000-0000-4000-8000-000000000000",
  slug: DEMO_SLUG,
  fullName: "Alex Rivera",
  headline: "Product Designer",
  company: "Estudio Norte",
  location: "Valencia, ES",
  pronouns: "",
  bio: "Diseño productos digitales que la gente entiende a la primera. Hablemos de interfaces, sistemas de diseño o café.",
  accentColor: "#EF7A4A",
  detailColor: "#FFE3D1",
  pattern: "arco",
  patternSeed: 48213,
  typeface: "clasica",
  avatarUrl: null,
  avatarPath: null,
  isPublished: true,
  acceptsContactRequests: true,
  acceptsMeetingRequests: true,
  // Every day, every time the picker shows, no notice: the sample behaves as before P8.4.
  meetingSettings: DEMO_MEETING_SETTINGS,
  meetingRules: rulesOf(DEMO_MEETING_SETTINGS),
  updatedAt: "2026-09-27T00:00:00.000Z",
  links: [
    { id: "demo-email", kind: "email", value: "alex@example.com", visible: true },
    { id: "demo-mobile", kind: "phone", value: "+34 612 345 678", visible: true },
    { id: "demo-linkedin", kind: "linkedin", value: "https://www.linkedin.com/in/alex-rivera-demo", visible: true },
    { id: "demo-web", kind: "website", value: "https://example.com", label: "Portfolio", visible: true },
    { id: "demo-instagram", kind: "instagram", value: "estudio.norte", visible: true },
    // Hidden on purpose: tests check it never reaches visitors.
    { id: "demo-phone", kind: "phone", value: "+34 600 000 000", visible: false },
  ],
};

/** What the editor's "Contactos recibidos" panel shows in demo mode. */
export const DEMO_CONTACT_REQUESTS: ContactRequest[] = [
  {
    id: "00000000-0000-4000-8000-0000000000c1",
    name: "Lucía Martín",
    email: "lucia@example.com",
    phone: null,
    company: "Hotel Mirador",
    message: "Nos conocimos en la feria de Valencia. Me encantaría hablar del rediseño de nuestra web.",
    source: "qr",
    createdAt: "2026-09-26T10:30:00.000Z",
  },
];

/** Demo mode has no database: these handles play the part of "already taken" in the editor. */
const DEMO_TAKEN_SLUGS: ReadonlySet<string> = new Set(["alex", "alex-rivera", "pablo-serrano", "pablo-serrano-3", "lucia-ferrer"]);

export function isDemoSlugTaken(slug: string): boolean {
  return DEMO_TAKEN_SLUGS.has(slug);
}
