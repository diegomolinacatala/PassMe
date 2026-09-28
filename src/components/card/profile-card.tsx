import { ArrowUpRight, MapPin, UserRoundPlus } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { cardCssVars } from "@/lib/card/colors";
import { linkDisplay, linkHref, linkTitle } from "@/lib/card/links";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { LinkIcon } from "./link-icon";
import { ShareButton, TrackedLink } from "./profile-actions";

interface ProfileCardProps {
  card: PublicCard;
  /** Editor preview: no navigation, no tracking. */
  preview?: boolean;
  className?: string;
}

/**
 * The public contact card (what people see after scanning the QR).
 * Styled like a physical pass: accent-colored stub, perforation, paper body.
 */
export function ProfileCard({ card, preview = false, className }: ProfileCardProps) {
  const name = card.fullName || "Tu nombre";
  const meta = [card.headline, card.company].filter(Boolean).join(" · ");
  const vcardHref = `/u/${encodeURIComponent(card.slug)}/vcard`;

  return (
    <article
      className={cn("relative overflow-hidden rounded-[28px] bg-card shadow-object", className)}
      style={cardCssVars(card.accentColor)}
      aria-label={`Tarjeta de contacto de ${name}`}
    >
      {/* Stub */}
      <header className="relative bg-[var(--card-bg)] px-6 pt-5 pb-9 text-[var(--card-fg)]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            <Mark className="size-4" cutout="var(--card-bg)" />
            Tarjeta de contacto
          </span>
          {card.pronouns ? (
            <span className="rounded-full border border-current/25 px-2 py-0.5 font-mono text-[10px] tracking-wide">
              {card.pronouns}
            </span>
          ) : null}
        </div>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[2.6rem] leading-[0.95] tracking-tight break-words">{name}</h1>
            {meta ? <p className="mt-2 text-[0.95rem] leading-snug opacity-85">{meta}</p> : null}
          </div>
          <Avatar name={name} url={card.avatarUrl} size={84} className="ring-4 ring-[var(--card-fg)]/15" />
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
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--card-bg)] text-[var(--card-fg)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-rotate-6">
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
