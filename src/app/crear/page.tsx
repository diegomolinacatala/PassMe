import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { CreateFlow, type CreateMode, type Referrer } from "@/components/create/create-flow";
import { randomPatternSeed } from "@/lib/card/design";
import { parseFromSlug } from "@/lib/card/quick";
import { findOwnerCard, getPublicCard } from "@/lib/data/cards";
import { getTurnstileSiteKey, isGoogleAuthEnabled } from "@/lib/env";
import { detectPlatform } from "@/lib/platform";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Crea tu tarjeta",
  description: "Tu tarjeta de visita en Apple Wallet y Google Wallet en un minuto. Gratis y sin instalar nada.",
  alternates: { canonical: "/crear" },
};

export default async function CreateCardPage({ searchParams }: PageProps<"/crear">) {
  const query = await searchParams;
  const from = parseFromSlug(query.de);

  const supabase = await createServerSupabase();
  const user = supabase ? await getSessionUser(supabase) : null;
  if (supabase && user) {
    // Already has a card: nothing to create, straight to the editor.
    const card = await findOwnerCard(supabase, user.id);
    if (card?.fullName) redirect("/dashboard");
  }
  const mode: CreateMode = !supabase ? "demo" : user ? "member" : "guest";

  const card = from ? await getPublicCard(from) : null;
  const referrer: Referrer | null = card ? { slug: card.slug, fullName: card.fullName, avatarUrl: card.avatarUrl } : null;
  const platform = detectPlatform((await headers()).get("user-agent"));

  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex h-20 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Logo />
        {mode === "member" ? (
          // Signed in with the wrong account (e.g. Google picked another one): a way out.
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              Cerrar sesión
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">
            <span className="max-sm:hidden">¿Ya tienes tarjeta? </span>
            <Link href="/login" className="font-medium text-ink underline underline-offset-4 hover:text-signal-deep">
              Entrar
            </Link>
          </p>
        )}
      </header>
      <div className="pt-4 sm:pt-10">
        <CreateFlow
          mode={mode}
          from={card ? card.slug : from}
          referrer={referrer}
          initialSeed={randomPatternSeed()}
          accountEmail={user?.email ?? null}
          previewStyle={platform === "android" ? "google" : "apple"}
          googleEnabled={mode !== "demo" && isGoogleAuthEnabled()}
          captchaSiteKey={getTurnstileSiteKey()}
        />
      </div>
    </main>
  );
}
