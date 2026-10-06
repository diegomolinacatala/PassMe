import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark } from "@/components/brand/logo";
import { CardPageProvider, HideAfterSending } from "@/components/card/card-page-context";
import { ContactForm } from "@/components/card/contact-form";
import { CreateYoursBar, CreateYoursCta, OwnCardNote } from "@/components/card/create-yours";
import { ProfileCard } from "@/components/card/profile-card";
import { ViewTracker } from "@/components/card/profile-actions";
import { QrCode } from "@/components/card/qr-code";
import { SaveContact } from "@/components/card/save-contact";
import { MeetingRequest } from "@/components/meetings/meeting-request";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { resolveDesign } from "@/lib/card/design";
import { createPath } from "@/lib/card/quick";
import { servesVCardInline, vcardDisplayFilename } from "@/lib/card/vcard";
import { findOwnerCard, getPublicCard, resolveSlugRedirect } from "@/lib/data/cards";
import { getTurnstileSiteKey, profileUrl } from "@/lib/env";
import { firstName } from "@/lib/meetings/model";
import { meetingsAvailable } from "@/lib/meetings/service";
import { detectPlatform } from "@/lib/platform";
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
  const [viewer, requestHeaders] = await Promise.all([viewerOf(card.slug), headers()]);
  const userAgent = requestHeaders.get("user-agent");
  const isOwner = viewer === "owner";
  const owner = firstName(card.fullName);
  const vcardHref = `/u/${encodeURIComponent(card.slug)}/vcard${source !== "direct" ? `?src=${source}` : ""}`;

  return (
    <main
      className="min-h-dvh px-4 pt-4 pb-14 sm:pt-8 [@media(max-height:500px)]:pt-2"
      // A faint halo of the card's own color, as if the pass lit up the paper.
      style={{ backgroundImage: `radial-gradient(60rem 28rem at 50% -6rem, ${background}33, transparent 70%)` }}
    >
      <CardPageProvider>
        <div className="mx-auto w-full max-w-[440px] animate-rise lg:max-w-[800px]">
          <CreateYoursBar slug={card.slug} via={source} isOwner={isOwner} />
          <div className="lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start lg:gap-12">
            <div className="min-w-0">
              <ProfileCard
                card={card}
                saveAction={
                  <SaveContact
                    href={vcardHref}
                    fileName={vcardDisplayFilename(card.fullName, card.slug)}
                    firstName={owner}
                    opensInline={servesVCardInline(userAgent)}
                    createHref={isOwner ? null : createPath(card.slug, source)}
                    canLeaveContact={card.acceptsContactRequests}
                  />
                }
                shareAction={
                  <ShareLinkButton
                    url={profileUrl(card.slug, "share")}
                    title={`${card.fullName} · PassMe`}
                    shareLabel="Pasarle esta tarjeta a alguien"
                    copyLabel="Pasarle esta tarjeta a alguien"
                    shareIcon={detectPlatform(userAgent) === "ios" ? "ios" : "android"}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
                  />
                }
              />

              {/* The reciprocal gesture first; the meeting after. */}
              {takesMeetings || card.acceptsContactRequests ? (
                <div className="mt-5 space-y-3">
                  {card.acceptsContactRequests ? (
                    <ContactForm slug={card.slug} ownerName={card.fullName} source={source} captchaSiteKey={captchaSiteKey} />
                  ) : null}
                  {takesMeetings ? (
                    <MeetingRequest slug={card.slug} ownerName={card.fullName} source={source} captchaSiteKey={captchaSiteKey} />
                  ) : null}
                </div>
              ) : null}

              {isOwner ? (
                <OwnCardNote />
              ) : (
                <HideAfterSending>
                  <CreateYoursCta slug={card.slug} via={source} ownerName={card.fullName} />
                </HideAfterSending>
              )}

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

            {/* On a computer, the card goes to the phone with one scan. */}
            {isOwner ? null : (
              <aside aria-labelledby="pasala-al-movil" className="hidden lg:sticky lg:top-8 lg:block">
                <figure data-qr-value={profileUrl(card.slug, "qr")} className="rounded-object border hairline bg-card px-8 pt-8 pb-7 text-center shadow-soft">
                  <QrCode value={profileUrl(card.slug, "qr")} label={`Código QR de la tarjeta de ${card.fullName}`} className="mx-auto w-full max-w-[220px] text-ink" />
                  <figcaption id="pasala-al-movil" className="mt-5 font-display text-2xl leading-tight text-balance">
                    Escanéalo con tu móvil para guardar a <em className="text-signal">{owner}.</em>
                  </figcaption>
                </figure>
              </aside>
            )}
          </div>
        </div>
      </CardPageProvider>
      <ViewTracker slug={card.slug} source={source} />
    </main>
  );
}
