import { Check, ChevronDown, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMotif } from "@/components/brand/brand-motif";
import { LinkIcon } from "@/components/card/link-icon";
import { LinkButton } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import type { LinkKind } from "@/lib/card/links";

const PRIVACY_ROWS: Array<{ kind: LinkKind; label: string; value: string; visible: boolean }> = [
  { kind: "email", label: "Email", value: "alex@estudionorte.com", visible: true },
  { kind: "linkedin", label: "LinkedIn", value: "in/alex-rivera", visible: true },
  { kind: "booking", label: "Reservar una cita", value: "cal.com/alex", visible: true },
  { kind: "phone", label: "Teléfono", value: "+34 600 ·· ·· ··", visible: false },
  { kind: "whatsapp", label: "WhatsApp", value: "+34 600 ·· ·· ··", visible: false },
];

const PRIVACY_POINTS = [
  {
    icon: EyeOff,
    title: "Lo que ocultas no lo ve nadie",
    body: "No se envía ni al navegador: simplemente no está.",
  },
  {
    icon: RefreshCw,
    title: "Cambias de trabajo, no de tarjeta",
    body: "Editas el cargo, la foto o el diseño y el pase se actualiza solo en todas las carteras.",
  },
  {
    icon: Trash2,
    title: "Tu tarjeta, tus reglas",
    body: "Despublícala o borra la cuenta con un botón. Se elimina todo, también la foto.",
  },
];

export function PrivacySection() {
  return (
    <section id="privacidad" aria-labelledby="privacidad-title" className="scroll-mt-10 bg-ink text-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:py-28">
        <div className="lg:col-span-6">
          <p className="eyebrow text-paper/60">Tus datos</p>
          <h2 id="privacidad-title" className="mt-3 font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight lg:text-[length:var(--text-display)]">
            Tú decides <em className="text-glow">qué</em> se ve.
          </h2>
          <p className="mt-4 max-w-md text-body leading-relaxed text-paper/70 lg:text-lg">
            El LinkedIn en un evento, el WhatsApp a un cliente. Cambia de idea cuando quieras.
          </p>

          <ul className="mt-8 space-y-6 lg:mt-12 lg:space-y-8">
            {PRIVACY_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-paper/20 text-glow">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-paper/65 lg:text-body">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* The switches demo says the same as the first point: computers only. */}
        <div className="hidden lg:col-span-5 lg:col-start-8 lg:block">
          <div className="rounded-object border border-paper/12 bg-paper/[0.04] p-3 sm:p-4" aria-label="Ejemplo de contactos visibles y ocultos">
            <p className="eyebrow px-3 pt-2 pb-4 text-paper/60">Tus datos de contacto</p>
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
                    <span className={`eyebrow block ${row.visible ? "" : "text-inherit"}`}>{row.label}</span>
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

const QUESTIONS: Array<{ question: string; answer: ReactNode }> = [
  {
    question: "¿La otra persona necesita una app?",
    answer:
      "No. Escanea tu QR con la cámara de su móvil, ve tu tarjeta en el navegador y guarda tu contacto con un toque. Funciona igual en iPhone que en Android.",
  },
  {
    question: "¿En qué se diferencia de NameDrop o de un Linktree?",
    answer:
      "NameDrop solo funciona entre dos iPhone que se tocan. Un Linktree es una lista de enlaces. PassMe es una tarjeta de visita: vive en la cartera de tu móvil, la abre cualquier móvil con cámara, la otra persona la guarda en sus contactos y tú decides qué datos se ven.",
  },
  {
    question: "¿Cuánto cuesta?",
    answer:
      "Nada. Tu tarjeta, tu QR y tu pase son gratis para siempre. Si algún día añadimos funciones de pago, serán opcionales y nunca te cobraremos sin que lo aceptes.",
  },
  {
    question: "¿Qué datos guardáis?",
    answer: (
      <>
        Tu email, para que entres sin contraseña, y lo que escribas en tu tarjeta. Lo que ocultas nunca llega a quien la
        visita, y las estadísticas no guardan IPs ni usan cookies de seguimiento. Todo el detalle está en{" "}
        <Link href="/privacidad" className="underline underline-offset-2 hover:text-ink">
          la política de privacidad
        </Link>
        .
      </>
    ),
  },
  {
    question: "¿Y si me arrepiento?",
    answer:
      "Despublica tu tarjeta cuando quieras: quien escanee tu QR verá que no está disponible y tu pase quedará en pausa. O borra tu cuenta desde el editor y se borra todo, también tu foto.",
  },
];

/** «Preguntas rápidas»: native <details>, closed, so it works without JavaScript and with any screen reader. */
export function QuickQuestions() {
  return (
    <section id="preguntas" aria-labelledby="preguntas-title" className="scroll-mt-10">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-6 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:py-28">
        <div className="lg:col-span-4">
          <p className="eyebrow">Antes de empezar</p>
          <h2 id="preguntas-title" className="mt-3 font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight lg:text-[length:var(--text-display)]">
            Preguntas <em className="text-signal">rápidas.</em>
          </h2>
        </div>
        <div className="divide-y divide-ink/10 border-y hairline lg:col-span-8">
          {QUESTIONS.map(({ question, answer }) => (
            <details key={question} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-body font-medium tracking-tight [&::-webkit-details-marker]:hidden lg:text-lg">
                {question}
                <ChevronDown
                  className="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="max-w-2xl pb-6 leading-relaxed text-ink-soft">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ ctaHref, googleWallet }: { ctaHref: string; googleWallet: boolean }) {
  return (
    <section aria-labelledby="cta-title" className="px-5 pb-14 sm:px-8 lg:pb-24">
      <div className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-object bg-glow px-6 py-14 text-center text-ink sm:px-12 lg:py-28">
        <BrandMotif
          color={BRAND.signal}
          pattern="persiana"
          size={1100}
          height={760}
          seed={2026}
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 opacity-35"
        />
        <p className="eyebrow relative text-ink-soft">Empieza hoy</p>
        <h2 id="cta-title" className="relative mx-auto mt-3 max-w-3xl font-display text-[length:var(--text-title)] leading-[0.95] tracking-tight lg:text-[length:var(--text-display)]">
          Deja de repartir papel. <em className="text-signal-deep">Pásate.</em>
        </h2>
        <ul className="relative mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink lg:text-body">
          {["Gratis para siempre", "Listo en 2 minutos", googleWallet ? "iPhone y Android" : "Funciona en cualquier móvil con cámara"].map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-signal-deep" aria-hidden /> {item}
            </li>
          ))}
        </ul>
        <LinkButton href={ctaHref} variant="ink" size="lg" className="relative mt-8 max-sm:w-full">
          Crear mi tarjeta
        </LinkButton>
      </div>
    </section>
  );
}
