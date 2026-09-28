import type { Metadata } from "next";
import { Guilloche } from "@/components/brand/guilloche";
import { Logo } from "@/components/brand/logo";
import { WalletPass } from "@/components/card/wallet-pass";
import { BRAND } from "@/lib/brand";
import { DEMO_CARD } from "@/lib/card/demo";
import { themeDesign } from "@/lib/card/design";
import { toPublicCard } from "@/lib/data/cards";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/request";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

const ERRORS: Record<string, string> = {
  link: "El enlace ha caducado o ya se usó. Pide uno nuevo.",
  oauth: "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
  config: "El login aún no está conectado (falta configurar Supabase).",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const next = safeNextPath(typeof query.next === "string" ? query.next : null);
  const errorKey = typeof query.error === "string" ? query.error : "";
  const configured = isSupabaseConfigured();
  const demo = toPublicCard(DEMO_CARD);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <p className="eyebrow">Acceso</p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight">
            Entra y crea <em className="text-signal">tu tarjeta.</em>
          </h1>
          <p className="mt-4 text-ink-soft">Solo necesitamos tu email. Sin contraseñas que recordar.</p>

          <div className="mt-10">
            {configured ? (
              <LoginForm next={next} googleEnabled={isGoogleAuthEnabled()} initialError={ERRORS[errorKey]} />
            ) : (
              <div className="rounded-2xl border border-dashed border-line-strong bg-card p-5 text-sm leading-relaxed text-ink-soft">
                <p className="font-medium text-ink">Modo demo</p>
                <p className="mt-1">
                  Supabase todavía no está configurado, así que el login está desactivado. Puedes probar el editor en modo
                  demo (no se guarda nada).
                </p>
                <a href="/dashboard" className="mt-4 inline-block font-medium text-signal-deep underline underline-offset-4">
                  Abrir el editor demo →
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside
        className="relative hidden overflow-hidden bg-ink lg:flex lg:items-center lg:justify-center"
        aria-hidden="true"
      >
        <Guilloche
          color={BRAND.glow}
          size={900}
          seed={1618}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20"
        />
        <div className="relative h-[520px] w-[520px]">
          <div className="absolute top-10 left-2 w-[290px] -rotate-[10deg]">
            <WalletPass card={{ ...demo, ...themeDesign("papel", "senal", 104_882), fullName: "Marta Gil", headline: "Abogada", company: "Gil & Asociados", location: "Madrid" }} />
          </div>
          <div className="absolute top-24 right-0 w-[290px] rotate-[7deg]">
            <WalletPass card={{ ...demo, ...themeDesign("terracota", "ondas", 730_115), fullName: "Jon Etxeberria", headline: "Sales Lead", company: "Kobalt", location: "Bilbao" }} style="google" />
          </div>
          <div className="absolute top-44 left-[115px] w-[300px] animate-float [--tilt:-1deg]">
            <WalletPass card={demo} />
          </div>
        </div>
      </aside>
    </main>
  );
}
