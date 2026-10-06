import { MapPin, UserRoundPlus } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cardCssVars } from "@/lib/card/colors";
import { resolveDesign, type Typeface } from "@/lib/card/design";
import { linkDisplay, linkHref, linkTitle, linkVerb, whatsappHrefForPhone, type LinkKind } from "@/lib/card/links";
import { nameScale, type NameScale } from "@/lib/card/name-scale";
import { fadesUnderText } from "@/lib/card/pattern";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { LinkIcon } from "./link-icon";
import { DeferredPatternSvg } from "./deferred-pattern-svg";
import { editorialLines, monogram, MONOGRAM_OPACITY } from "./pass-art";
import { TrackedLink } from "./profile-actions";

interface ProfileCardProps {
  card: PublicCard;
  /** Editor preview: no navigation, no tracking. */
  preview?: boolean;
  /** The public page's "Guardar contacto" (a client component); the preview draws a still one. */
  saveAction?: ReactNode;
  /** "Pasarle esta tarjeta a alguien", under the contact rows. */
  shareAction?: ReactNode;
  className?: string;
}

/** Header artwork box: anchored bottom-right so the seal always wraps the avatar. */
const ART_BOX = { width: 600, height: 210 };
const AVATAR_SIZE = 88;
/** Avatar center, measured from the header's bottom-right corner (px-6 / pb-9 + half the avatar). */
const AVATAR_INSET = { right: 24 + AVATAR_SIZE / 2, bottom: 36 + AVATAR_SIZE / 2 };
const ART_FOCUS = { x: ART_BOX.width - AVATAR_INSET.right, y: ART_BOX.height - AVATAR_INSET.bottom, r: AVATAR_SIZE / 2 };

/** The name in the owner's typeface (the pass sets it the same way). */
const NAME_CLASSES: Record<Typeface, string> = {
  clasica: "font-display leading-[0.95] tracking-tight",
  cursiva: "font-display leading-[0.95] tracking-tight italic",
  editorial: "font-display leading-[0.95] tracking-tight",
  moderna: "font-sans leading-[1.02] font-medium tracking-[-0.035em]",
};

/**
 * Name sizes: fluid with the screen, a step down for long names, and smaller
 * on landscape phones so "Guardar contacto" peeks on the first screen.
 * The sans typeface is wider, so it runs smaller.
 */
const NAME_SIZES: Record<"serif" | "sans", Record<NameScale, string>> = {
  serif: {
    lg: "text-[clamp(2rem,1.6rem+2vw,2.7rem)] [@media(max-height:500px)]:text-[2rem]",
    md: "text-[clamp(1.75rem,1.45rem+1.5vw,2.2rem)] [@media(max-height:500px)]:text-[1.75rem]",
    sm: "text-[clamp(1.5rem,1.3rem+1vw,1.8rem)] [@media(max-height:500px)]:text-[1.5rem]",
  },
  sans: {
    lg: "text-[clamp(1.6rem,1.3rem+1.5vw,2.05rem)] [@media(max-height:500px)]:text-[1.6rem]",
    md: "text-[clamp(1.45rem,1.2rem+1.2vw,1.75rem)] [@media(max-height:500px)]:text-[1.45rem]",
    sm: "text-[clamp(1.3rem,1.15rem+0.8vw,1.5rem)] [@media(max-height:500px)]:text-[1.3rem]",
  },
};

/** A still "Guardar contacto" for the editor's preview: looks like the real one, but isn't an action. */
const PREVIEW_SAVE_CLASSES = buttonClasses({ variant: "signal", size: "lg", className: "w-full" }).replace("btn-signal", "");

/** Emails and phone numbers may break anywhere (they have no spaces); the rest between words when possible. */
function valueBreak(kind: LinkKind): string {
  return kind === "email" || kind === "phone" || kind === "whatsapp" ? "break-all" : "break-words";
}

/** The pass's monogram, centered on the avatar like on the strip. */
function Monogram({ name, italic }: { name: string; italic: boolean }) {
  const { letter, size, shiftX } = monogram(name, AVATAR_SIZE / 2);
  return (
    <span
      className={cn("pointer-events-none absolute -z-10 flex items-center justify-center leading-none", italic ? "font-display italic" : "font-sans font-medium")}
      style={{
        right: AVATAR_INSET.right - shiftX - size,
        bottom: AVATAR_INSET.bottom - size,
        width: size * 2,
        height: size * 2,
        fontSize: italic ? size : size * 0.8,
        color: "var(--card-detail)",
        opacity: MONOGRAM_OPACITY,
      }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

/**
 * The public contact card (what people see after scanning the QR).
 * Styled like the pass: the card's color and motif on the stub, a
 * perforation, and a paper body with the contacts.
 */
export function ProfileCard({ card, preview = false, saveAction, shareAction, className }: ProfileCardProps) {
  const name = card.fullName || "Tu nombre";
  const meta = [card.headline, card.company].filter(Boolean).join(" · ");
  const design = resolveDesign(card);
  const [first, rest] = editorialLines(name);
  const nameSize = NAME_SIZES[design.typeface === "moderna" ? "sans" : "serif"][nameScale(name)];
  // A phone with its country code also gets a WhatsApp button, unless the card already lists WhatsApp.
  const listsWhatsapp = card.links.some((link) => link.kind === "whatsapp");

  return (
    <article
      className={cn("relative overflow-hidden rounded-object bg-card shadow-object", className)}
      style={cardCssVars(design.background, design.detail)}
      aria-label={`Tarjeta de ${name}`}
    >
      {/* Stub */}
      <header className="relative isolate overflow-hidden bg-[var(--card-bg)] px-6 pt-5 pb-9 text-[var(--card-fg)]">
        {design.pattern === "monograma" ? <Monogram name={name} italic={design.typeface !== "moderna"} /> : null}
        <DeferredPatternSvg
          design={design}
          box={ART_BOX}
          focus={ART_FOCUS}
          fade={fadesUnderText(design.pattern) ? { from: ART_BOX.width - 330, to: ART_BOX.width - 150 } : undefined}
          width={ART_BOX.width}
          height={ART_BOX.height}
          style={{ position: "absolute", right: 0, bottom: 0, zIndex: -1, maxWidth: "none" }}
        />
        {/* No "Tarjeta de contacto" label: the PassMe logo is right above the card. */}
        {card.pronouns ? (
          <div className="flex justify-end">
            <span className="rounded-full border border-current/25 bg-[var(--card-bg)] px-2 py-0.5 font-mono text-mark tracking-wide">
              {card.pronouns}
            </span>
          </div>
        ) : null}

        <div className={cn("flex items-end justify-between gap-4 [@media(max-height:500px)]:mt-3", card.pronouns ? "mt-6" : "mt-12")}>
          <div className="min-w-0">
            {/* Balanced lines, broken between words; break-words only rescues a single word wider than the card. */}
            <h1 className={cn("break-words text-balance", NAME_CLASSES[design.typeface], nameSize)}>
              {design.typeface === "editorial" && rest ? (
                <>
                  <span className="block">{first}</span>
                  <em className="block">{rest}</em>
                </>
              ) : (
                name
              )}
            </h1>
            {meta ? <p className="mt-2 text-body leading-snug opacity-90">{meta}</p> : null}
          </div>
          <Avatar
            name={name}
            url={card.avatarUrl}
            size={AVATAR_SIZE}
            className="ring-1 ring-[var(--card-detail)] ring-offset-4 ring-offset-[var(--card-bg)]"
          />
        </div>
      </header>

      {/* Perforation */}
      <div className="relative h-0" aria-hidden="true">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-paper" />
        <span className="absolute -top-3 -right-3 size-6 rounded-full bg-paper" />
        <span className="absolute top-0 right-5 left-5 border-t-2 border-dashed border-line" />
      </div>

      <div className="px-5 pt-6 pb-6">
        {card.location ? (
          <p className="eyebrow flex items-center gap-1.5 px-1">
            <MapPin className="size-3.5" aria-hidden />
            {card.location}
          </p>
        ) : null}

        {card.bio ? (
          <p className="mt-3 px-1 text-body leading-relaxed whitespace-pre-line text-ink-soft">{card.bio}</p>
        ) : null}

        <div className="mt-5">
          {preview ? (
            <span className={PREVIEW_SAVE_CLASSES}>
              <UserRoundPlus className="size-5" aria-hidden />
              Guardar contacto
            </span>
          ) : (
            saveAction
          )}
        </div>

        {card.links.length > 0 ? (
          <ul className="mt-6 divide-y divide-line/80 border-y border-line/80">
            {card.links.map((link) => {
              const display = linkDisplay(link.kind, link.value);
              const whatsapp = link.kind === "phone" && !listsWhatsapp ? whatsappHrefForPhone(link.value) : null;
              const content = (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--card-bg)] text-[var(--card-label)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-rotate-6">
                    <LinkIcon kind={link.kind} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="eyebrow block">{linkTitle(link)}</span>
                    <span className={cn("block text-body", valueBreak(link.kind))}>{display}</span>
                  </span>
                  {/* What tapping does, instead of a generic arrow. */}
                  <span className="shrink-0 text-sm font-medium text-muted transition-colors group-hover:text-ink">{linkVerb(link.kind)}</span>
                </>
              );
              const rowClass = "group flex min-w-0 flex-1 items-center gap-3.5 px-1 py-3.5";
              const whatsappClass =
                "grid size-11 shrink-0 place-items-center rounded-full border hairline text-ink transition-colors hover:bg-ink hover:text-paper";
              return (
                <li key={link.id} className="flex items-center gap-2">
                  {preview ? (
                    <div className={rowClass}>{content}</div>
                  ) : (
                    <TrackedLink href={linkHref(link.kind, link.value)} slug={card.slug} linkId={link.id} className={rowClass}>
                      {content}
                    </TrackedLink>
                  )}
                  {whatsapp ? (
                    preview ? (
                      <span className={whatsappClass} aria-hidden="true">
                        <LinkIcon kind="whatsapp" size={18} />
                      </span>
                    ) : (
                      <TrackedLink href={whatsapp} slug={card.slug} linkId={link.id} className={whatsappClass} label={`WhatsApp a ${display}`}>
                        <LinkIcon kind="whatsapp" size={18} />
                      </TrackedLink>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : preview ? (
          // Only the owner sees this nudge; visitors just see the card without an empty box.
          <p className="mt-6 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Añade un teléfono o un email para que puedan contactarte.
          </p>
        ) : null}

        {shareAction ? <div className="mt-3 flex justify-center">{shareAction}</div> : null}
      </div>
    </article>
  );
}
