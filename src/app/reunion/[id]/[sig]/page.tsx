import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MeetingResponse, type MeetingPreset } from "@/components/meetings/meeting-response";
import { DEMO_CARD } from "@/lib/card/demo";
import { getMeetingRecord, withOwnerEmail } from "@/lib/data/meetings";
import { isSupabaseConfigured } from "@/lib/env";
import { verifyMeetingSignature } from "@/lib/meetings/links";
import type { MeetingParty } from "@/lib/meetings/state";
import { demoMeetingById, isDemoMeetingId, toMeetingView, type MeetingView } from "@/lib/meetings/view";

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

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <p className="eyebrow">Agendar reunión</p>
      <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight">{title}</h1>
      <p className="mt-4 text-ink-soft">{text}</p>
      <Link href="/" className="mt-8 inline-block text-sm font-medium text-signal-deep underline-offset-4 hover:underline">
        Ir a PassMe
      </Link>
    </div>
  );
}

async function loadView(id: string, signature: string): Promise<{ view: MeetingView; demo: boolean } | "invalid" | "gone"> {
  const now = new Date();
  if (isDemoMeetingId(id) && !isSupabaseConfigured()) {
    const party: MeetingParty = signature === "invitado" ? "guest" : "owner";
    const owner = { id: "demo", name: DEMO_CARD.fullName, slug: DEMO_CARD.slug, email: "alex@example.com" };
    return { view: toMeetingView(demoMeetingById(id, now), owner, party, now), demo: true };
  }
  const party = verifyMeetingSignature(id.toLowerCase(), signature);
  if (!party) return "invalid";
  const record = await getMeetingRecord(id.toLowerCase());
  if (!record) return "gone";
  const owner =
    party === "guest" && record.meeting.status === "confirmed" ? await withOwnerEmail(record.owner) : record.owner;
  return { view: toMeetingView(record.meeting, owner, party, now), demo: false };
}

/** Where each side answers a meeting: the owner from the email's buttons, the guest to manage it. */
export default async function MeetingPage({ params, searchParams }: PageProps<"/reunion/[id]/[sig]">) {
  const [{ id, sig }, query] = await Promise.all([params, searchParams]);
  const loaded = await loadView(id, sig);

  return (
    <main className="min-h-dvh px-4 pt-5 pb-16 sm:pt-8">
      <div className="mx-auto w-full max-w-[480px]">
        <Logo />
        {loaded === "invalid" ? (
          <Unavailable title="Enlace no válido" text="Ábrelo de nuevo desde el último email que recibiste sobre esta reunión." />
        ) : loaded === "gone" ? (
          <Unavailable title="Esta reunión ya no está" text="Puede que se haya borrado o que haya pasado hace tiempo." />
        ) : (
          <MeetingResponse id={id} signature={sig} initial={loaded.view} preset={presetFrom(query)} demo={loaded.demo} />
        )}
      </div>
    </main>
  );
}
