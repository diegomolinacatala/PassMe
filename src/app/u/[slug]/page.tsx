import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark } from "@/components/brand/logo";
import { ContactForm } from "@/components/card/contact-form";
import { ProfileCard } from "@/components/card/profile-card";
import { ViewTracker } from "@/components/card/profile-actions";
import { resolveDesign } from "@/lib/card/design";
import { getPublicCard, resolveSlugRedirect } from "@/lib/data/cards";
import { getTurnstileSiteKey } from "@/lib/env";
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

  return (
    <main
      className="min-h-dvh px-4 pt-6 pb-14 sm:pt-12"
      // A faint halo of the card's own color, as if the pass lit up the paper.
      style={{ backgroundImage: `radial-gradient(60rem 28rem at 50% -6rem, ${background}33, transparent 70%)` }}
    >
      <div className="mx-auto w-full max-w-[440px] animate-rise">
        <ProfileCard card={card} />

        {card.acceptsContactRequests ? (
          <div className="mt-5">
            <ContactForm slug={card.slug} ownerName={card.fullName} source={source} captchaSiteKey={getTurnstileSiteKey()} />
          </div>
        ) : null}

        <footer className="mt-8 flex flex-col items-center gap-2 text-center">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <Mark className="size-5 text-ink transition-transform duration-500 group-hover:-rotate-6" />
            <span>
              Hecho con <span className="font-display text-base text-ink italic">PassMe</span> · crea la tuya
            </span>
          </Link>
        </footer>
      </div>
      <ViewTracker slug={card.slug} source={source} />
    </main>
  );
}
