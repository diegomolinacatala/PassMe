"use client";

import { useState } from "react";
import { ProfileCard } from "@/components/card/profile-card";
import { WalletPass } from "@/components/card/wallet-pass";
import type { PublicCard } from "@/lib/card/types";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "apple", label: "Apple Wallet" },
  { id: "google", label: "Google Wallet" },
  { id: "web", label: "Al escanear" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PreviewPanel({ card }: { card: PublicCard }) {
  const [tab, setTab] = useState<TabId>("apple");

  return (
    <div>
      <div role="tablist" aria-label="Vista previa" className="flex rounded-full border hairline bg-paper-deep/70 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`preview-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="preview-panel"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-300",
              tab === t.id ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="preview-panel"
        role="tabpanel"
        aria-labelledby={`preview-tab-${tab}`}
        className="relative mt-5 flex min-h-[460px] justify-center rounded-[28px] bg-[#e6e1d7] px-4 py-8 shadow-[inset_0_2px_12px_rgb(20_20_20/0.08)]"
      >
        {tab === "web" ? (
          <div className="w-full max-w-[360px] origin-top scale-[0.94]">
            <ProfileCard card={card} preview />
          </div>
        ) : (
          <div key={tab} className="w-full max-w-[330px] animate-rise">
            <WalletPass card={card} style={tab} />
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        {tab === "web"
          ? "Esto es lo que ve quien escanea tu QR. Solo aparecen los contactos visibles."
          : "Vista aproximada: cada cartera dibuja el pase a su manera."}
      </p>
    </div>
  );
}
