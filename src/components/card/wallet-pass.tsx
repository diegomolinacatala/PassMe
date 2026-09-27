import { Mark } from "@/components/brand/logo";
import { cardPalette, toHex } from "@/lib/card/colors";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";
import { prettyProfileUrl, profileUrl } from "@/lib/env";
import { Avatar } from "./avatar";
import { QrCode } from "./qr-code";

export type PassStyle = "apple" | "google";

interface WalletPassProps {
  card: PublicCard;
  style?: PassStyle;
  className?: string;
}

/**
 * Visual preview of the wallet pass. Mirrors the field layout produced by
 * lib/pass/apple.ts and lib/pass/google.ts so the editor shows what the
 * phone will show.
 */
export function WalletPass({ card, style = "apple", className }: WalletPassProps) {
  const palette = cardPalette(card.accentColor);
  const bg = toHex(palette.background);
  const fg = toHex(palette.foreground);
  const label = toHex(palette.label);
  const name = card.fullName || "Tu nombre";

  const qr = (
    <div className="mx-auto w-fit rounded-xl bg-white p-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.15)]">
      <QrCode value={profileUrl(card.slug || "tu-nombre", "qr")} label="Código QR de la tarjeta" className="size-[112px] text-black" quietZone={1} />
      <p className="mt-1.5 max-w-[112px] truncate text-center font-mono text-[9px] leading-none text-black/60">
        {prettyProfileUrl(card.slug || "tu-nombre")}
      </p>
    </div>
  );

  if (style === "google") {
    return (
      <div
        className={cn("w-full max-w-[340px] overflow-hidden rounded-[24px] shadow-object", className)}
        style={{ backgroundColor: bg, color: fg }}
        aria-label={`Vista previa del pase de Google Wallet de ${name}`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <div className="grid size-9 place-items-center overflow-hidden rounded-full bg-white/90">
            {card.avatarUrl ? (
              <Avatar name={name} url={card.avatarUrl} size={36} />
            ) : (
              <Mark className="size-6 text-ink" cutout="#fff" />
            )}
          </div>
          <span className="truncate text-sm font-medium">{card.company || "PassMe"}</span>
        </div>
        <div className="mt-4 border-t px-5 pt-4" style={{ borderColor: `${fg}26` }}>
          {card.headline ? (
            <p className="text-xs" style={{ color: label }}>
              {card.headline}
            </p>
          ) : null}
          <p className="mt-0.5 text-[1.6rem] leading-tight font-medium tracking-tight">{name}</p>
          {card.company || card.location ? (
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p style={{ color: label }}>Empresa</p>
                <p className="mt-0.5 truncate font-medium">{card.company || "—"}</p>
              </div>
              <div className="text-right">
                <p style={{ color: label }}>Ubicación</p>
                <p className="mt-0.5 truncate font-medium">{card.location || "—"}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="px-5 pt-6 pb-6">{qr}</div>
      </div>
    );
  }

  return (
    <div
      className={cn("w-full max-w-[340px] rounded-[18px] px-4 pt-3.5 pb-5 shadow-object", className)}
      style={{ backgroundColor: bg, color: fg }}
      aria-label={`Vista previa del pase de Apple Wallet de ${name}`}
    >
      <div className="flex items-center gap-2">
        <Mark className="size-7" cutout={bg} />
        <span className="truncate text-[15px] font-medium tracking-tight">{card.company || "PassMe"}</span>
      </div>

      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: label }}>
            {card.headline || "Contacto"}
          </p>
          <p className="mt-1 text-[1.7rem] leading-[1.05] font-light tracking-tight break-words">{name}</p>
        </div>
        <Avatar name={name} url={card.avatarUrl} size={72} className="mt-0.5" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {card.company ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: label }}>
              Empresa
            </p>
            <p className="truncate text-[15px]">{card.company}</p>
          </div>
        ) : null}
        {card.location ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: label }}>
              Ubicación
            </p>
            <p className="truncate text-[15px]">{card.location}</p>
          </div>
        ) : null}
      </div>
      {card.pronouns ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: label }}>
            Pronombres
          </p>
          <p className="text-[15px]">{card.pronouns}</p>
        </div>
      ) : null}

      <div className="mt-7">{qr}</div>
    </div>
  );
}
