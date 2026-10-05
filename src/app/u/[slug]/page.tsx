import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark } from "@/components/brand/logo";
import { ContactForm } from "@/components/card/contact-form";
import { CreateYoursBar, CreateYoursCta, OwnCardNote } from "@/components/card/create-yours";
import { ProfileCard } from "@/components/card/profile-card";
import { ViewTracker } from "@/components/card/profile-actions";
import { MeetingRequest } from "@/components/meetings/meeting-request";
import { resolveDesign } from "@/lib/card/design";
import { findOwnerCard, getPublicCard, resolveSlugRedirect } from "@/lib/data/cards";
import { getTurnstileSiteKey } from "@/lib/env";
import { meetingsAvailable } from "@/lib/meetings/service";
import { parseVisitSource } from "@/lib/request";
import { createServerSupabase, getSessionUser, hasSessionCookie } from "@/lib/supabase/server";

type Viewer = "owner" | "signed-in" | "anonymous";

/**
 * Who's looking: the card's owner gets "Editar" instead of "Crear la mía".
 * Only checked when there's a session cookie, so visitors cost nothing extra.
 */
async function viewerOf(slug: string): Promise<Viewer> {
  if (!(await hasSessionCookie())) return "anonymous";
  const supabase = await createServerSupabase();
  const user = supabase ? await getSessionUser(supabase) : null;
  if (!supabase || !user) return "anonymous";
  const own = await findOwnerCard(supabase, user.id);
  return own?.slug === slug ? "owner" : "signed-in";
}

export async function generateMetadata({ params }: PageProps<"/u/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const card = await getPublicCard(slug);
  if (!card) return { title: "Tarjeta no encontrada", robots: { index: false } };

  const description = [card.headline, card.company, card.location].filter(Boolean).join(" · ") || "Tarjeta de contacto";
  return {
    title: card.fullName,
    description,
    alternates: { canonical: `/u/${card.slug}` },
    openGraph: { title: `${card.fullName} · PassMe`, description, type: "profile" },
    // Personal cards shouldn't be indexed by search engines by default.
    robots: { index: false, follow: false },
  };
}

export default async function PublicCardPage({ params, searchParams }: PageProps<"/u/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const source = parseVisitSource(typeof query.src === "string" ? query.src : null);
  const card = await getPublicCard(slug);
  if (!card) {
    // An old handle (the owner renamed the card): follow it, keeping the QR/share source.
    // Temporary redirect on purpose — the owner may switch back to this handle later.
    const current = await resolveSlugRedirect(slug);
    if (current) redirect(`/u/${current}${source === "direct" ? "" : `?src=${source}`}`);
    notFound();
  }

  const { background } = resolveDesign(card);
  const captchaSiteKey = getTurnstileSiteKey();
  const takesMeetings = card.acceptsMeetingRequests && meetingsAvailable();
  const viewer = await viewerOf(card.slug);

  return (
    <main
      className="min-h-dvh px-4 pt-4 pb-14 sm:pt-8"
      // A faint halo of the card's own color, as if the pass lit up the paper.
      style={{ backgroundImage: `radial-gradient(60rem 28rem at 50% -6rem, ${background}33, transparent 70%)` }}
    >
      <div className="mx-auto w-full max-w-[440px] animate-rise">
        <CreateYoursBar slug={card.slug} via={source} isOwner={viewer === "owner"} />
        <ProfileCard card={card} source={source} />

        {takesMeetings || card.acceptsContactRequests ? (
          <div className="mt-5 space-y-3">
            {takesMeetings ? (
              <MeetingRequest slug={card.slug} ownerName={card.fullName} source={source} captchaSiteKey={captchaSiteKey} />
            ) : null}
            {card.acceptsContactRequests ? (
              <ContactForm slug={card.slug} ownerName={card.fullName} source={source} captchaSiteKey={captchaSiteKey} />
            ) : null}
          </div>
        ) : null}

        {viewer === "owner" ? <OwnCardNote /> : <CreateYoursCta slug={card.slug} via={source} ownerName={card.fullName} />}

        <footer className="mt-8 flex flex-col items-center gap-1">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <Mark className="size-5 text-ink transition-transform duration-500 group-hover:-rotate-6" />
            <span>
              Hecho con <span className="font-display text-base text-ink italic">PassMe</span>
            </span>
          </Link>
          {viewer === "anonymous" ? (
            <p className="text-sm text-muted">
              ¿Es tu tarjeta?{" "}
              <Link href="/login?next=/dashboard" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 hover:text-signal-deep">
                Entrar
              </Link>
            </p>
          ) : null}
        </footer>
      </div>
      <ViewTracker slug={card.slug} source={source} />
    </main>
  );
}
