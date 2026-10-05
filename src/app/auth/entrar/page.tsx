import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { isEmailLinkType, isTokenHash } from "@/lib/auth/email-link";
import { safeNextPath } from "@/lib/request";
import { confirmEmailLinkAction } from "./actions";
import { ConfirmButton } from "./confirm-button";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

/** One tap between the email's button and the session (mail scanners don't tap). */
export default async function ConfirmEmailLinkPage({ searchParams }: PageProps<"/auth/entrar">) {
  const query = await searchParams;
  const tokenHash = query.token_hash;
  const type = query.type;
  if (!isTokenHash(tokenHash) || !isEmailLinkType(type)) redirect("/login?error=link");
  const next = safeNextPath(typeof query.next === "string" ? query.next : null);

  return (
    <main className="flex min-h-dvh flex-col px-5 py-6">
      <Logo />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16 text-center">
        <p className="eyebrow">Entrar</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight">
          Un toque y <em className="text-signal">dentro.</em>
        </h1>
        <p className="mt-4 text-ink-soft">Pulsa para entrar en PassMe en este dispositivo.</p>
        <form action={confirmEmailLinkAction} className="mt-8">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <ConfirmButton />
        </form>
        <p className="mt-6 text-xs leading-relaxed text-muted">
          ¿Por qué este paso? Algunos correos abren los enlaces para revisarlos. Así tu código sigue valiendo hasta que entras tú.
        </p>
      </div>
    </main>
  );
}
