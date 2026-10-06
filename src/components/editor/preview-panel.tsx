"use client";

import { ArrowRight, CalendarClock, HandHeart } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ProfileCard } from "@/components/card/profile-card";
import { WalletPass } from "@/components/card/wallet-pass";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "apple", label: "Apple Wallet", short: "Apple" },
  { id: "google", label: "Google Wallet", short: "Google" },
  { id: "web", label: "Al escanear", short: "Al escanear" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PreviewPanel({ card }: { card: PublicCard }) {
  const [tab, setTab] = useState<TabId>("apple");
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  // ARIA tabs: one Tab stop (the selected tab); arrows, Home and End move and select.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const target =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    setTab(TABS[target]!.id);
    buttons.current[target]?.focus();
  }

  return (
    <div className="min-w-0">
      <div role="tablist" aria-label="Vista previa" className="flex min-w-0 rounded-full border hairline bg-paper-deep/70 p-1">
        {TABS.map((t, index) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            // The full name even when the phone shows the short one ("Google" → "Google Wallet").
            aria-label={t.label}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-full px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-300 sm:px-3",
              tab === t.id ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        className="relative mt-5 flex min-h-[460px] min-w-0 justify-center overflow-hidden rounded-object bg-paper-deep px-3 py-8 shadow-inset sm:px-4"
      >
        {tab === "web" ? (
          <div className="w-full max-w-[360px] min-w-0 origin-top scale-[0.94]">
            <ProfileCard card={card} preview />
            <PreviewActions card={card} />
          </div>
        ) : (
          <div key={tab} className="w-full max-w-[330px] min-w-0 animate-rise">
            <WalletPass card={card} style={tab} />
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        {tab === "web"
          ? "Esto es lo que ve quien escanea tu QR. Solo aparecen los datos visibles."
          : "Vista aproximada: cada cartera dibuja el pase a su manera."}
      </p>
    </div>
  );
}

/** A still copy of a public card's action row ("Déjale tu contacto", "Agendar reunión"): it looks the same but does nothing. */
function StillAction({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex w-full items-center gap-4 rounded-panel border hairline bg-card px-5 py-4 text-left shadow-soft">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-signal-wash text-signal-deep">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{subtitle}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
    </div>
  );
}

/** What the switches in "Al escanear" add under the card, in the same order as the public page. */
function PreviewActions({ card }: { card: PublicCard }) {
  if (!card.acceptsContactRequests && !card.acceptsMeetingRequests) return null;
  const firstName = card.fullName.split(" ")[0] || "ti";
  return (
    <div className="mt-4 space-y-3">
      {card.acceptsContactRequests ? (
        <StillAction
          icon={<HandHeart className="size-5" aria-hidden />}
          title={`Déjale tu contacto a ${firstName}`}
          subtitle="Así también tiene el tuyo. Tardas 20 segundos."
        />
      ) : null}
      {card.acceptsMeetingRequests ? (
        <StillAction
          icon={<CalendarClock className="size-5" aria-hidden />}
          title={`Agendar reunión con ${firstName}`}
          subtitle={`Propón día y hora. ${firstName} confirma con un toque.`}
        />
      ) : null}
    </div>
  );
}
