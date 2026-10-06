import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { EmailCodeAuth } from "@/components/auth/email-code-auth";
import { BrandMotif } from "@/components/brand/brand-motif";
import { Logo } from "@/components/brand/logo";
import { WalletPass } from "@/components/card/wallet-pass";
import { DEMO_LOGIN_CODE } from "@/lib/auth/code";
import { BRAND } from "@/lib/brand";
import { DEMO_CARD } from "@/lib/card/demo";
import { themeDesign } from "@/lib/card/design";
import { toPublicCard } from "@/lib/data/cards";
import { getTurnstileSiteKey, isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/env";
import { detectPlatform } from "@/lib/platform";
import { safeNextPath } from "@/lib/request";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

const ERRORS: Record<string, string> = {
  link: "El enlace ha caducado o ya se usó. Pide uno nuevo.",
  oauth: "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
  config: "El acceso no está disponible ahora mismo. Inténtalo más tarde.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const next = safeNextPath(typeof query.next === "string" ? query.next : null);
  const errorKey = typeof query.error === "string" ? query.error : "";
  const configured = isSupabaseConfigured();
  const demo = toPublicCard(DEMO_CARD);
  const platform = detectPlatform((await headers()).get("user-agent"));

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <p className="eyebrow">Entrar</p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight">
            Entra en <em className="text-signal">tu tarjeta.</em>
          </h1>
          <p className="mt-4 text-ink-soft">Te enviamos un código a tu email y listo. Sin contraseñas que recordar.</p>

          {configured ? null : (
            <p className="mt-6 rounded-2xl border border-dashed border-signal/50 bg-signal-wash/60 px-4 py-3 text-sm text-signal-deep">
              <strong>Modo demo:</strong> no se envía ningún email y el código es{" "}
              <span className="font-mono">{DEMO_LOGIN_CODE}</span>.
            </p>
          )}

          <div className="mt-8">
            <EmailCodeAuth
              next={next}
              continueTo={next}
              googleEnabled={configured && isGoogleAuthEnabled()}
              captchaSiteKey={getTurnstileSiteKey()}
              platform={platform}
              initialError={Object.hasOwn(ERRORS, errorKey) ? ERRORS[errorKey] : undefined}
              submitLabel="Entrar"
              autoFocus
            />
          </div>

          <p className="mt-8 text-sm text-ink-soft">
            ¿Aún no tienes tarjeta?{" "}
            <Link href="/crear" className="font-medium text-signal-deep underline underline-offset-4 hover:text-ink">
              Crear mi tarjeta
            </Link>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Al continuar aceptas los{" "}
            <a href="/terminos" className="underline underline-offset-2 hover:text-ink">
              términos de uso
            </a>{" "}
            y la{" "}
            <a href="/privacidad" className="underline underline-offset-2 hover:text-ink">
              política de privacidad
            </a>
            .
          </p>
        </div>
      </section>

      <aside
        className="relative hidden overflow-hidden bg-ink lg:flex lg:items-center lg:justify-center"
        aria-hidden="true"
      >
        <BrandMotif
          color={BRAND.glow}
          pattern="corriente"
          size={900}
          seed={1618}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20"
        />
        <div className="relative h-[520px] w-[520px]">
          <div className="absolute top-10 left-2 w-[290px] -rotate-[10deg]">
            <WalletPass card={{ ...demo, ...themeDesign("papel", "persiana", 104_882, "cursiva"), fullName: "Marta Gil", headline: "Abogada", company: "Gil & Asociados", location: "Madrid" }} />
          </div>
          <div className="absolute top-24 right-0 w-[290px] rotate-[7deg]">
            <WalletPass card={{ ...demo, ...themeDesign("terracota", "cinta", 730_115), fullName: "Jon Etxeberria", headline: "Sales Lead", company: "Kobalt", location: "Bilbao" }} style="google" />
          </div>
          <div className="absolute top-44 left-[115px] w-[300px] animate-float [--tilt:-1deg]">
            <WalletPass card={demo} />
          </div>
        </div>
      </aside>
    </main>
  );
}
