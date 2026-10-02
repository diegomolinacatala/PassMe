import { ArrowUpRight, Check, EyeOff, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { BrandMotif } from "@/components/brand/brand-motif";
import { LinkIcon } from "@/components/card/link-icon";
import { WalletPass } from "@/components/card/wallet-pass";
import { LinkButton } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { themeDesign } from "@/lib/card/design";
import type { LinkKind } from "@/lib/card/links";
import type { PublicCard } from "@/lib/card/types";

const CONTACT_KINDS = [
  "Email",
  "LinkedIn",
  "WhatsApp",
  "Teléfono",
  "Instagram",
  "Web",
  "Calendly",
  "GitHub",
  "X",
  "TikTok",
  "YouTube",
  "Telegram",
];

export function ContactMarquee() {
  const items = [...CONTACT_KINDS, ...CONTACT_KINDS];
  return (
    <div className="relative overflow-hidden bg-ink py-4" aria-hidden="true">
      <div className="flex w-max animate-marquee gap-8 font-mono text-[12px] tracking-[0.18em] text-paper/80 uppercase">
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-8">
            {item}
            <span className="text-glow">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Diseña tu tarjeta",
    body: "Nombre, cargo, foto y los contactos que quieras. Eliges motivo, tintas y letra; nosotros nos aseguramos de que se lea bien.",
  },
  {
    n: "02",
    title: "Añádela a tu cartera",
    body: "Un toque y vive en Apple Wallet o Google Wallet, junto a tus tarjetas y billetes. No hay app que instalar.",
  },
  {
    n: "03",
    title: "Enséñala en un segundo",
    body: "Doble clic al botón lateral, muestras el QR y la otra persona guarda tu contacto con lo que tú has decidido compartir.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-10">
      <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <p className="eyebrow lg:col-span-3">Cómo funciona</p>
          <h2 id="como-funciona-title" className="font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight lg:col-span-9">
            Del bolsillo a su agenda <em className="text-signal">sin teclear nada.</em>
          </h2>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-[28px] border hairline bg-ink/10 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="group relative bg-paper p-8 transition-colors duration-500 hover:bg-card sm:p-10">
              <span className="font-display text-[5.5rem] leading-none text-muted transition-colors duration-500 group-hover:text-signal">
                {step.n}
              </span>
              <h3 className="mt-6 text-xl font-medium tracking-tight">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const PRIVACY_ROWS: Array<{ kind: LinkKind; label: string; value: string; visible: boolean }> = [
  { kind: "email", label: "Email", value: "alex@estudionorte.com", visible: true },
  { kind: "linkedin", label: "LinkedIn", value: "in/alex-rivera", visible: true },
  { kind: "booking", label: "Reservar cita", value: "cal.com/alex", visible: true },
  { kind: "phone", label: "Teléfono", value: "+34 600 ·· ·· ··", visible: false },
  { kind: "whatsapp", label: "WhatsApp", value: "+34 600 ·· ·· ··", visible: false },
];

const PRIVACY_POINTS = [
  {
    icon: EyeOff,
    title: "Lo oculto no sale del servidor",
    body: "Los contactos que ocultas no se envían ni al navegador. No es un truco visual: simplemente no están.",
  },
  {
    icon: ShieldCheck,
    title: "Métricas sin rastrear a nadie",
    body: "Contamos visitas y clics para que sepas si funciona. Sin IPs, sin cookies de terceros, sin perfiles.",
  },
  {
    icon: Trash2,
    title: "Tu tarjeta, tus reglas",
    body: "Despublícala cuando quieras o borra la cuenta con un botón. Se elimina todo, también la foto.",
  },
];

export function PrivacySection() {
  return (
    <section id="privacidad" aria-labelledby="privacidad-title" className="scroll-mt-10 bg-ink text-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-16 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <p className="eyebrow text-paper/60">Privacidad</p>
          <h2 id="privacidad-title" className="mt-4 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
            Tú decides <em className="text-glow">qué</em> se ve.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-paper/70">
            No todo el mundo quiere repartir su móvil. Enseña el LinkedIn en un evento, el WhatsApp a un cliente — y cambia
            de idea cuando quieras.
          </p>

          <ul className="mt-12 space-y-8">
            {PRIVACY_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-paper/20 text-glow">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 leading-relaxed text-paper/65">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-5 lg:col-start-8">
          <div className="rounded-[28px] border border-paper/12 bg-paper/[0.04] p-3 sm:p-4" aria-label="Ejemplo de contactos visibles y ocultos">
            <p className="eyebrow px-3 pt-2 pb-4 text-paper/60">Tus contactos</p>
            <ul className="space-y-2">
              {PRIVACY_ROWS.map((row) => (
                <li
                  key={row.label}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${row.visible ? "bg-paper text-ink" : "bg-paper/[0.06] text-paper/75"}`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${row.visible ? "bg-signal-strong text-white" : "bg-paper/10"}`}
                  >
                    <LinkIcon kind={row.kind} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-mono text-[10px] tracking-[0.14em] uppercase ${row.visible ? "text-muted" : ""}`}>{row.label}</span>
                    <span className={`block truncate text-sm ${row.visible ? "" : "line-through decoration-paper/30"}`}>
                      {row.value}
                    </span>
                  </span>
                  <span
                    className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${row.visible ? "bg-ink" : "bg-paper/15"}`}
                    aria-label={row.visible ? "Visible" : "Oculto"}
                    role="img"
                  >
                    <span
                      className={`absolute top-1 size-4 rounded-full bg-paper transition-transform ${row.visible ? "left-5" : "left-1"}`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AlwaysUpdated({ card }: { card: PublicCard }) {
  const before: PublicCard = { ...card, ...themeDesign("arena", "arco", 48_213), headline: "Product Designer", company: "Estudio Norte" };
  const after: PublicCard = {
    ...card,
    ...themeDesign("cafe", "corriente", 48_213, "editorial"),
    headline: "Head of Design",
    company: "Norte & Co.",
  };

  return (
    <section aria-labelledby="actualizada-title" className="overflow-x-clip">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow">Siempre al día</p>
          <h2 id="actualizada-title" className="mt-4 font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
            Cambias de trabajo, <em className="text-signal">no de tarjeta.</em>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            Edita tu cargo, tu foto, tus enlaces o el diseño entero y el pase se actualiza solo en todas las carteras
            donde esté. Nada de reimprimir, nada de volver a enviar.
          </p>
          <p className="mt-8 inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.12em] text-muted uppercase">
            <RefreshCw className="size-4 text-signal" aria-hidden />
            Actualización automática en Apple y Google Wallet
          </p>
        </div>

        <div className="relative flex items-center justify-center gap-4 sm:gap-8 lg:col-span-7" aria-hidden="true">
          <div className="w-[46%] max-w-[270px] -rotate-3 scale-95">
            <WalletPass card={before} />
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper shadow-soft">
            <ArrowUpRight className="size-5 rotate-45" />
          </span>
          <div className="w-[46%] max-w-[270px] rotate-2">
            <WalletPass card={after} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ ctaHref }: { ctaHref: string }) {
  return (
    <section aria-labelledby="cta-title" className="px-5 pb-24 sm:px-8">
      <div className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-[36px] bg-glow px-6 py-20 text-center text-ink sm:px-12 sm:py-28">
        <BrandMotif
          color={BRAND.signal}
          pattern="persiana"
          size={1100}
          height={760}
          seed={2026}
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 opacity-35"
        />
        <p className="eyebrow relative text-ink-soft">Empieza hoy</p>
        <h2 id="cta-title" className="relative mx-auto mt-4 max-w-3xl font-display text-[length:var(--text-display)] leading-[0.95] tracking-tight">
          Deja de repartir papel. <em className="text-signal-deep">Pásate.</em>
        </h2>
        <ul className="relative mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-ink">
          {["Gratis", "Listo en 2 minutos", "iPhone y Android"].map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-signal-deep" aria-hidden /> {item}
            </li>
          ))}
        </ul>
        <LinkButton href={ctaHref} variant="ink" size="lg" className="relative mt-10">
          Crear mi tarjeta
        </LinkButton>
      </div>
    </section>
  );
}
