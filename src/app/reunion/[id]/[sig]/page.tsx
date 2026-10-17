import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MeetingResponse, type MeetingPreset } from "@/components/meetings/meeting-response";
import { DEMO_CARD } from "@/lib/card/demo";
import { findMeetingRecord, withOwnerEmail } from "@/lib/data/meetings";
import { isSupabaseConfigured } from "@/lib/env";
import { verifyMeetingSignature } from "@/lib/meetings/links";
import type { MeetingParty } from "@/lib/meetings/state";
import { DEMO_CONTACT_EMAIL, demoMeetingById, isDemoMeetingId, toMeetingView, type MeetingView } from "@/lib/meetings/view";

export const metadata: Metadata = {
  title: "Reunión",
  robots: { index: false, follow: false },
  // The signed link is in the path: never hand it to another site.
  referrer: "no-referrer",
};

function presetFrom(query: Record<string, string | string[] | undefined>): MeetingPreset {
  const hora = typeof query.hora === "string" && /^[0-2]$/.test(query.hora) ? Number(query.hora) : null;
  const mode = query.accion === "otra" ? "counter" : query.accion === "no" ? "decline" : null;
  return { slotIndex: hora, mode };
}

/** This same page again, with the time or answer the email's button chose. */
function retryPath(id: string, sig: string, preset: MeetingPreset): string {
  const query = new URLSearchParams();
  if (preset.slotIndex !== null) query.set("hora", String(preset.slotIndex));
  if (preset.mode) query.set("accion", preset.mode === "counter" ? "otra" : "no");
  const suffix = query.size > 0 ? `?${query}` : "";
  return `/reunion/${encodeURIComponent(id)}/${encodeURIComponent(sig)}${suffix}`;
}

function Unavailable({ title, text, retryHref }: { title: string; text: string; retryHref?: string }) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <p className="eyebrow">Agendar reunión</p>
      <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight">{title}</h1>
      <p className="mt-4 text-ink-soft">{text}</p>
      {retryHref ? (
        // A plain anchor: it must ask the server again, not reuse what the router has.
        <a href={retryHref} className="mt-8 inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-sm font-medium text-paper">
          Intentarlo de nuevo
        </a>
      ) : null}
      <div>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-signal-deep underline-offset-4 hover:underline">
          Ir a PassMe
        </Link>
      </div>
    </div>
  );
}

/** invalid: not a link of ours. gone: no such meeting. error: the database failed, so nothing is known (retry). */
async function loadView(id: string, signature: string): Promise<{ view: MeetingView; demo: boolean } | "invalid" | "gone" | "error"> {
  const now = new Date();
  if (isDemoMeetingId(id) && !isSupabaseConfigured()) {
    const party: MeetingParty = signature === "invitado" ? "guest" : "owner";
    const owner = { id: "demo", name: DEMO_CARD.fullName, slug: DEMO_CARD.slug, email: "alex@example.com", contactEmail: DEMO_CONTACT_EMAIL };
    return { view: toMeetingView(demoMeetingById(id, now), owner, party, now), demo: true };
  }
  const party = verifyMeetingSignature(id.toLowerCase(), signature);
  if (!party) return "invalid";
  const lookup = await findMeetingRecord(id.toLowerCase());
  if (lookup.status === "error") return "error";
  if (lookup.status === "missing") return "gone";
  const { record } = lookup;
  // The owner sees which email the guest will get; the guest, once confirmed.
  const owner = party === "owner" || record.meeting.status === "confirmed" ? await withOwnerEmail(record.owner) : record.owner;
  return { view: toMeetingView(record.meeting, owner, party, now), demo: false };
}

/** Where each side answers a meeting: the owner from the email's buttons, the guest to manage it. */
export default async function MeetingPage({ params, searchParams }: PageProps<"/reunion/[id]/[sig]">) {
  const [{ id, sig }, query] = await Promise.all([params, searchParams]);
  const loaded = await loadView(id, sig);
  const preset = presetFrom(query);

  return (
    <main className="min-h-dvh px-4 pt-5 pb-16 sm:pt-8">
      <div className="mx-auto w-full max-w-[480px]">
        <Logo />
        {loaded === "invalid" ? (
          <Unavailable title="Enlace no válido" text="Ábrelo de nuevo desde el último email que recibiste sobre esta reunión." />
        ) : loaded === "gone" ? (
          <Unavailable title="Esta reunión ya no está" text="Puede que se haya borrado o que haya pasado hace tiempo." />
        ) : loaded === "error" ? (
          <Unavailable
            title="No hemos podido cargarla"
            text="Ha fallado algo de nuestro lado, no el enlace. Inténtalo de nuevo en un momento."
            retryHref={retryPath(id, sig, preset)}
          />
        ) : (
          <MeetingResponse id={id} signature={sig} initial={loaded.view} preset={preset} demo={loaded.demo} />
        )}
      </div>
    </main>
  );
}
