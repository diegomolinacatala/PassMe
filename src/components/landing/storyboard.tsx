import { CircleCheck, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { ProfileCard } from "@/components/card/profile-card";
import { QrCode } from "@/components/card/qr-code";
import { WalletPass } from "@/components/card/wallet-pass";
import { themeDesign } from "@/lib/card/design";
import type { PublicCard } from "@/lib/card/types";
import { prettyProfileUrl, profileUrl } from "@/lib/env";

interface StoryboardProps {
  card: PublicCard;
  /** Google Wallet is live (GOOGLE_WALLET_LIVE): never promise what doesn't work yet. */
  googleWallet: boolean;
}

/**
 * "Cómo funciona" as three frames of the real thing: the pass in the wallet,
 * the camera reading the QR, the contact saved. Shown, not told.
 */
export function Storyboard({ card, googleWallet }: StoryboardProps) {
  const scenes: Array<{ n: string; title: string; body: string; visual: ReactNode }> = [
    {
      n: "01",
      title: "Vive en tu cartera",
      body: googleWallet
        ? "Junto a tus tarjetas y billetes, en Apple Wallet o Google Wallet. Sin app que instalar."
        : "Junto a tus tarjetas y billetes, en Apple Wallet. En Android, tu QR desde la pantalla de inicio. Sin app que instalar.",
      visual: <WalletScene card={card} />,
    },
    {
      n: "02",
      title: "Enseñas el QR",
      body: "La otra persona lo apunta con la cámara de su móvil. Ni app, ni escribir tu nombre, ni buscar después.",
      visual: <ScanScene card={card} />,
    },
    {
      n: "03",
      title: "Te guarda en un toque",
      body: "Ve tu tarjeta con lo que tú has decidido enseñar y te guarda en sus contactos. Con foto.",
      visual: <SavedScene card={card} />,
    },
  ];

  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-10">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <p className="eyebrow lg:col-span-3">Cómo funciona</p>
          <h2 id="como-funciona-title" className="font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight lg:col-span-9">
            Del bolsillo a su agenda <em className="text-signal">sin teclear nada.</em>
          </h2>
        </div>

        <ol className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-5">
          {scenes.map((scene) => (
            <li key={scene.n} className="group mx-auto flex w-full max-w-[440px] flex-col lg:max-w-none">
              <div className="relative aspect-[4/5] overflow-hidden rounded-object bg-paper-deep shadow-inset" aria-hidden="true">
                {scene.visual}
              </div>
              <div className="flex gap-4 px-2 pt-6">
                <span className="font-mono text-mark leading-[1.9] text-signal-deep">{scene.n}</span>
                <div>
                  <h3 className="text-xl font-medium tracking-tight">{scene.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{scene.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The top of a phone, with the pass in the wallet. */
function WalletScene({ card }: { card: PublicCard }) {
  return (
    <div className="absolute inset-x-[12%] top-[10%] rounded-[40px] bg-ink p-[9px] shadow-object">
      <div className="overflow-hidden rounded-[32px] bg-paper px-3 pt-2.5 pb-10">
        <div className="flex items-center justify-between px-2 pt-1 text-mark font-semibold text-ink">
          <span>9:41</span>
          <span className="h-[22px] w-[76px] rounded-full bg-ink" />
          <span className="h-2.5 w-4 rounded-[3px] border border-ink/80" />
        </div>
        <p className="mt-4 px-1 text-mark font-semibold tracking-wide text-ink/70 uppercase">Cartera</p>
        <div className="mt-2 transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-translate-y-1">
          <WalletPass card={card} className="max-w-none" />
        </div>
      </div>
    </div>
  );
}

/** The QR box inside <WalletPass>: 112 px plus its padding, 20 px from the pass's bottom edge. */
const PASS_QR = { size: 132, bottom: 20 };
/** The viewfinder, a little wider than the QR box. */
const FINDER = { size: PASS_QR.size + 20, bottom: PASS_QR.bottom - 10 };

/** A camera viewfinder locking on the QR, with the link the phone offers. */
function ScanScene({ card }: { card: PublicCard }) {
  const design = themeDesign("cafe");
  return (
    <div className="absolute inset-0 bg-ink">
      {/* What the camera sees: the pass, out of focus, and its QR sharp under the viewfinder. */}
      <div className="absolute inset-x-[14%] bottom-[17%]">
        <div className="opacity-90 blur-[1.5px]">
          <WalletPass card={{ ...card, ...design }} className="max-w-none" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-ink/35" />
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-xl bg-white p-2.5"
          style={{ bottom: PASS_QR.bottom, width: PASS_QR.size, height: PASS_QR.size }}
        >
          <QrCode value={profileUrl(card.slug, "qr")} label="" className="size-full text-black" quietZone={1} />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: FINDER.bottom, width: FINDER.size, height: FINDER.size }}>
          <Corner className="top-0 left-0 rounded-tl-lg border-t-[3px] border-l-[3px]" />
          <Corner className="top-0 right-0 rounded-tr-lg border-t-[3px] border-r-[3px]" />
          <Corner className="bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]" />
          <Corner className="right-0 bottom-0 rounded-br-lg border-r-[3px] border-b-[3px]" />
          <span className="absolute inset-x-[8%] top-[8%] h-[2px] animate-scan bg-signal shadow-[0_0_12px_2px_rgb(228_87_42/0.6)] [--scan-distance:124px]" />
        </div>
      </div>
      {/* The link the camera offers, like a phone does. */}
      <div className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-glow py-2 pr-4 pl-3 text-sm font-medium whitespace-nowrap text-ink shadow-soft">
        <Globe className="size-4" />
        {prettyProfileUrl(card.slug)}
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute size-[18%] border-glow ${className}`} />;
}

/** The public card on the other phone, with the contact already saved. */
function SavedScene({ card }: { card: PublicCard }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-x-[8%] top-[18%] origin-top scale-[0.86]">
        <ProfileCard card={{ ...card, bio: "", links: card.links.slice(0, 3) }} preview />
      </div>
      <div className="absolute top-[7%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-card py-2 pr-4 pl-2.5 text-sm font-medium whitespace-nowrap text-ink shadow-object">
        <span className="grid size-6 place-items-center rounded-full bg-ok text-white">
          <CircleCheck className="size-4" />
        </span>
        Contacto guardado
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-t from-paper-deep to-transparent" />
    </div>
  );
}
