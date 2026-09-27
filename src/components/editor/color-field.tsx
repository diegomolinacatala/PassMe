"use client";

import { Check, Pipette } from "lucide-react";
import { ACCENT_SWATCHES, cardPalette, toHex } from "@/lib/card/colors";
import { cn } from "@/lib/cn";

interface ColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorField({ value, onChange }: ColorFieldProps) {
  const current = value.toUpperCase();
  const isCustom = !ACCENT_SWATCHES.some((s) => s.hex.toUpperCase() === current);

  return (
    <div>
      <div role="radiogroup" aria-label="Color de la tarjeta" className="flex flex-wrap gap-2.5">
        {ACCENT_SWATCHES.map((swatch) => {
          const selected = swatch.hex.toUpperCase() === current;
          const fg = toHex(cardPalette(swatch.hex).foreground);
          return (
            <button
              key={swatch.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={swatch.name}
              title={swatch.name}
              onClick={() => onChange(swatch.hex)}
              className={cn(
                "grid size-10 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(20_20_20/0.12)] transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-110",
                selected && "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: swatch.hex, color: fg }}
            >
              {selected ? <Check className="size-4" aria-hidden /> : null}
            </button>
          );
        })}

        <label
          className={cn(
            "relative grid size-10 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong text-muted transition-transform hover:scale-110 focus-within:ring-2 focus-within:ring-signal",
            isCustom && "scale-110 border-solid ring-2 ring-ink ring-offset-2 ring-offset-card",
          )}
          style={isCustom ? { backgroundColor: current, color: toHex(cardPalette(current).foreground) } : undefined}
          title="Color personalizado"
        >
          <Pipette className="size-4" aria-hidden />
          <span className="sr-only">Color personalizado</span>
          <input
            type="color"
            value={current.toLowerCase()}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      <p className="mt-3 font-mono text-[11px] tracking-wide text-muted uppercase">
        {current} · texto {cardPalette(current).isDark ? "blanco" : "negro"} automático
      </p>
    </div>
  );
}
