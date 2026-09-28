import { ArrowUpRight, MapPin, UserRoundPlus } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { cardCssVars } from "@/lib/card/colors";
import { resolveDesign, type Typeface } from "@/lib/card/design";
import { linkDisplay, linkHref, linkTitle } from "@/lib/card/links";
import { fadesUnderText } from "@/lib/card/pattern";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { LinkIcon } from "./link-icon";
import { DeferredPatternSvg } from "./deferred-pattern-svg";
import { editorialLines, monogram, MONOGRAM_OPACITY } from "./pass-art";
import { ShareButton, TrackedLink } from "./profile-actions";

interface ProfileCardProps {
  card: PublicCard;
  /** Editor preview: no navigation, no tracking. */
  preview?: boolean;
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
  clasica: "font-display text-[2.7rem] leading-[0.95] tracking-tight",
  cursiva: "font-display text-[2.7rem] leading-[0.95] tracking-tight italic",
  editorial: "font-display text-[2.7rem] leading-[0.95] tracking-tight",
  moderna: "font-sans text-[2.05rem] leading-[1.02] font-medium tracking-[-0.035em]",
};

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
export function ProfileCard({ card, preview = false, className }: ProfileCardProps) {
  const name = card.fullName || "Tu nombre";
  const meta = [card.headline, card.company].filter(Boolean).join(" · ");
  const vcardHref = `/u/${encodeURIComponent(card.slug)}/vcard`;
  const design = resolveDesign(card);
  const [first, rest] = editorialLines(name);

  return (
    <article
      className={cn("relative overflow-hidden rounded-[28px] bg-card shadow-object", className)}
      style={cardCssVars(design.background, design.detail)}
      aria-label={`Tarjeta de contacto de ${name}`}
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
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-[var(--card-label)] uppercase">
            <Mark className="size-4" cutout="var(--card-bg)" />
            Tarjeta de contacto
          </span>
          {card.pronouns ? (
            <span className="rounded-full border border-current/25 bg-[var(--card-bg)] px-2 py-0.5 font-mono text-[10px] tracking-wide">
              {card.pronouns}
            </span>
          ) : null}
        </div>

        <div className="mt-10 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className={cn("break-words", NAME_CLASSES[design.typeface])}>
              {design.typeface === "editorial" && rest ? (
                <>
                  <span className="block">{first}</span>
                  <em className="block">{rest}</em>
                </>
              ) : (
                name
              )}
            </h1>
            {meta ? <p className="mt-2 text-[0.95rem] leading-snug opacity-90">{meta}</p> : null}
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
          <p className="flex items-center gap-1.5 px-1 font-mono text-[11px] tracking-wide text-muted uppercase">
            <MapPin className="size-3.5" aria-hidden />
            {card.location}
          </p>
        ) : null}

        {card.bio ? (
          <p className="mt-3 px-1 text-[0.95rem] leading-relaxed whitespace-pre-line text-ink-soft">{card.bio}</p>
        ) : null}

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          {preview ? (
            <span className={buttonClasses({ variant: "ink", size: "lg", className: "w-full" })}>
              <UserRoundPlus className="size-5" aria-hidden />
              Guardar contacto
            </span>
          ) : (
            // Plain link: iOS/Android open .vcf responses in the native "add contact" sheet.
            // Downloads are counted server-side by the vCard route.
            <a href={vcardHref} className={buttonClasses({ variant: "ink", size: "lg", className: "w-full" })}>
              <UserRoundPlus className="size-5" aria-hidden />
              Guardar contacto
            </a>
          )}
          <ShareButton name={name} slug={card.slug} disabled={preview} />
        </div>

        {card.links.length > 0 ? (
          <ul className="mt-6 divide-y divide-line/80 border-y border-line/80">
            {card.links.map((link) => {
              const content = (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--card-bg)] text-[var(--card-label)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-rotate-6">
                    <LinkIcon kind={link.kind} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                      {linkTitle(link)}
                    </span>
                    <span className="block truncate text-[0.98rem]">{linkDisplay(link.kind, link.value)}</span>
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink"
                    aria-hidden
                  />
                </>
              );
              const rowClass = "group flex items-center gap-3.5 px-1 py-3.5";
              return (
                <li key={link.id}>
                  {preview ? (
                    <div className={rowClass}>{content}</div>
                  ) : (
                    <TrackedLink href={linkHref(link.kind, link.value)} slug={card.slug} linkId={link.id} className={rowClass}>
                      {content}
                    </TrackedLink>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Todavía no hay enlaces visibles.
          </p>
        )}
      </div>
    </article>
  );
}
