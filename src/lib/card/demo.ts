import type { OwnerCard } from "./types";

/**
 * Fictional sample card served at /u/demo and used as the editor's starting
 * point in demo mode (no Supabase configured). Uses example.com-style data only.
 */
export const DEMO_SLUG = "demo";

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
  pattern: "orbitas",
  patternSeed: 48213,
  typeface: "clasica",
  avatarUrl: null,
  avatarPath: null,
  isPublished: true,
  updatedAt: "2026-09-27T00:00:00.000Z",
  links: [
    { id: "demo-email", kind: "email", value: "alex@example.com", visible: true },
    { id: "demo-linkedin", kind: "linkedin", value: "https://www.linkedin.com/in/alex-rivera-demo", visible: true },
    { id: "demo-web", kind: "website", value: "https://example.com", label: "Portfolio", visible: true },
    { id: "demo-instagram", kind: "instagram", value: "estudio.norte", visible: true },
    { id: "demo-booking", kind: "booking", value: "https://cal.com/alex-demo", visible: true },
    { id: "demo-phone", kind: "phone", value: "+34 600 000 000", visible: false },
  ],
};
