/**
 * The editor's sections, in one place: their anchors, titles and order. It's a
 * single page (decision D6 b): on phones, "Reuniones" and "Contactos recibidos"
 * move up, above "Estilo", when they have something in them.
 */

export const SECTION_KEYS = [
  "quien",
  "contactar",
  "estilo",
  "escanear",
  "publicacion",
  "cartera",
  "reuniones",
  "contactos",
  "actividad",
  "cuenta",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_META: Record<SectionKey, { id: string; title: string }> = {
  quien: { id: "quien-eres", title: "Quién eres" },
  contactar: { id: "como-contactarte", title: "Cómo contactarte" },
  estilo: { id: "estilo", title: "Estilo" },
  escanear: { id: "al-escanear", title: "Al escanear" },
  publicacion: { id: "publicacion", title: "Publicación y enlace" },
  cartera: { id: "cartera", title: "A la cartera" },
  reuniones: { id: "seccion-reuniones", title: "Reuniones" },
  contactos: { id: "seccion-contactos", title: "Contactos recibidos" },
  actividad: { id: "actividad", title: "Actividad" },
  cuenta: { id: "seccion-cuenta", title: "Cuenta" },
};

/** Sections that go up on phones when they have items, and where they land (after "Cómo contactarte"). */
const RAISABLE = ["reuniones", "contactos"] as const;
const RAISED_AT = 2;

/** Phone order: the inbox sections with items come right after the card's basics. */
export function mobileSectionOrder(withItems: Partial<Record<(typeof RAISABLE)[number], boolean>>): SectionKey[] {
  const raised = RAISABLE.filter((key) => withItems[key]);
  const rest = SECTION_KEYS.filter((key) => !(raised as ReadonlyArray<SectionKey>).includes(key));
  return [...rest.slice(0, RAISED_AT), ...raised, ...rest.slice(RAISED_AT)];
}

/** Two-digit section number ("01"). */
export function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/**
 * `order` utilities below 1024 px, written out so Tailwind sees them. Position 0
 * is the live preview, which always goes first on phones.
 */
export const MOBILE_ORDER_CLASSES = [
  "max-lg:order-1",
  "max-lg:order-2",
  "max-lg:order-3",
  "max-lg:order-4",
  "max-lg:order-5",
  "max-lg:order-6",
  "max-lg:order-7",
  "max-lg:order-8",
  "max-lg:order-9",
  "max-lg:order-10",
  "max-lg:order-11",
] as const;

export interface SectionLayout {
  key: SectionKey;
  id: string;
  title: string;
  /** Number on desktop (DOM order) and on phones (after moving the inbox up). */
  number: string;
  mobileNumber: string;
  /** Tailwind class that places it on phones. */
  orderClass: string;
}

export function sectionLayout(withItems: Partial<Record<(typeof RAISABLE)[number], boolean>>): Record<SectionKey, SectionLayout> {
  const mobile = mobileSectionOrder(withItems);
  return Object.fromEntries(
    SECTION_KEYS.map((key, index) => {
      const mobileIndex = mobile.indexOf(key);
      return [
        key,
        {
          key,
          ...SECTION_META[key],
          number: sectionNumber(index),
          mobileNumber: sectionNumber(mobileIndex),
          orderClass: MOBILE_ORDER_CLASSES[mobileIndex + 1]!,
        },
      ];
    }),
  ) as Record<SectionKey, SectionLayout>;
}
