import { Mark } from "@/components/brand/logo";
import { resolveDesign } from "@/lib/card/design";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { prettyProfileUrl, profileUrl } from "@/lib/env";
import { Avatar, initials } from "./avatar";
import { containerUnit, CSS_FONTS, PassArt } from "./pass-art";
import { QrCode } from "./qr-code";

export type PassStyle = "apple" | "google";

interface WalletPassProps {
  card: PublicCard;
  style?: PassStyle;
  className?: string;
}

interface Field {
  label: string;
  value: string;
}

/** Same fields, same order as lib/pass/apple.ts (store card) and lib/pass/google.ts (class row). */
function frontFields(card: PublicCard, style: PassStyle): Field[] {
  const fields: Field[] = [];
  if (style === "apple") {
    if (card.headline) fields.push({ label: "Cargo", value: card.headline });
    if (card.location) fields.push({ label: "Ubicación", value: card.location });
    if (card.pronouns) fields.push({ label: "Pronombres", value: card.pronouns });
  } else {
    if (card.company) fields.push({ label: "Empresa", value: card.company });
    if (card.location) fields.push({ label: "Ubicación", value: card.location });
  }
  return fields;
}

/**
 * Visual preview of the wallet pass. Mirrors the layout produced by
 * lib/pass/apple.ts and lib/pass/google.ts, and renders the very same
 * <PassArt> the server turns into the strip / hero images.
 */
export function WalletPass({ card, style = "apple", className }: WalletPassProps) {
  const design = resolveDesign(card);
  const name = card.fullName || "Tu nombre";
  const slug = card.slug || "tu-nombre";
  const fields = frontFields(card, style);
  const art = (variant: "strip" | "hero") => (
    <div style={{ containerType: "inline-size" }}>
      <PassArt
        design={design}
        variant={variant}
        name={name}
        initials={initials(name)}
        avatarSrc={card.avatarUrl}
        unit={containerUnit}
        fonts={CSS_FONTS}
        deferPattern
      />
    </div>
  );

  // Apple shows the bare code (no altText); Google prints the short URL under it.
  const qr = (
    <div className="mx-auto w-fit rounded-xl bg-white p-2.5 shadow-sm">
      <QrCode value={profileUrl(slug, "qr")} label="Código QR de la tarjeta" className="size-[112px] text-ink" quietZone={1} />
      {style === "google" ? (
        <p className="mt-1.5 max-w-[112px] truncate text-center font-mono text-mark leading-none text-black/60">
          {prettyProfileUrl(slug)}
        </p>
      ) : null}
    </div>
  );

  const fieldRow =
    fields.length > 0 ? (
      <dl className={cn("grid gap-3", fields.length === 1 ? "grid-cols-1" : fields.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="text-mark font-semibold tracking-[0.08em] uppercase" style={{ color: design.label }}>
              {field.label}
            </dt>
            <dd className="truncate text-small leading-snug">{field.value}</dd>
          </div>
        ))}
      </dl>
    ) : null;

  if (style === "google") {
    return (
      <div
        className={cn("w-full max-w-[340px] overflow-hidden rounded-panel shadow-object", className)}
        style={{ backgroundColor: design.background, color: design.foreground }}
        aria-label={`Vista previa del pase de Google Wallet de ${name}`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <div className="grid size-9 place-items-center overflow-hidden rounded-full bg-signal">
            {card.avatarUrl ? <Avatar name={name} url={card.avatarUrl} size={36} /> : <Mark className="size-6 text-paper" cutout="var(--color-signal)" />}
          </div>
          <span className="truncate text-sm font-medium">{card.company || "PassMe"}</span>
        </div>
        <div className="mt-4 border-t px-5 pt-4" style={{ borderColor: `${design.foreground}26` }}>
          {card.headline ? (
            <p className="text-xs" style={{ color: design.label }}>
              {card.headline}
            </p>
          ) : null}
          <p className="mt-0.5 text-[1.6rem] leading-tight font-medium tracking-tight">{name}</p>
          {fieldRow ? <div className="mt-4">{fieldRow}</div> : null}
        </div>
        <div className="px-5 pt-6 pb-6">{qr}</div>
        {art("hero")}
      </div>
    );
  }

  return (
    <div
      className={cn("w-full max-w-[340px] overflow-hidden rounded-2xl shadow-object", className)}
      style={{ backgroundColor: design.background, color: design.foreground }}
      aria-label={`Vista previa del pase de Apple Wallet de ${name}`}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
        <Mark className="size-7" cutout={design.background} style={{ color: design.label }} />
        <span className="truncate text-body font-medium tracking-tight">{card.company || "PassMe"}</span>
      </div>
      {art("strip")}
      {fieldRow ? <div className="px-3.5 pt-3">{fieldRow}</div> : null}
      <div className="px-3.5 pt-5 pb-5">{qr}</div>
    </div>
  );
}
