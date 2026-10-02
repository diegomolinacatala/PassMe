import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark } from "@/components/brand/logo";
import { ContactForm } from "@/components/card/contact-form";
import { CreateYoursBar, CreateYoursCta } from "@/components/card/create-yours";
import { ProfileCard } from "@/components/card/profile-card";
import { ViewTracker } from "@/components/card/profile-actions";
import { MeetingRequest } from "@/components/meetings/meeting-request";
import { resolveDesign } from "@/lib/card/design";
import { getPublicCard, resolveSlugRedirect } from "@/lib/data/cards";
import { getTurnstileSiteKey } from "@/lib/env";
import { meetingsAvailable } from "@/lib/meetings/service";
import { parseVisitSource } from "@/lib/request";

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

  return (
    <main
      className="min-h-dvh px-4 pt-4 pb-14 sm:pt-8"
      // A faint halo of the card's own color, as if the pass lit up the paper.
      style={{ backgroundImage: `radial-gradient(60rem 28rem at 50% -6rem, ${background}33, transparent 70%)` }}
    >
      <div className="mx-auto w-full max-w-[440px] animate-rise">
        <CreateYoursBar slug={card.slug} />
        <ProfileCard card={card} />

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

        <CreateYoursCta slug={card.slug} ownerName={card.fullName} />

        <footer className="mt-8 flex justify-center">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <Mark className="size-5 text-ink transition-transform duration-500 group-hover:-rotate-6" />
            <span>
              Hecho con <span className="font-display text-base text-ink italic">PassMe</span>
            </span>
          </Link>
        </footer>
      </div>
      <ViewTracker slug={card.slug} source={source} />
    </main>
  );
}
