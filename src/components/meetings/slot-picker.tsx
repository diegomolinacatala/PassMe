"use client";

import { CalendarPlus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { HORIZON_DAYS, MAX_SLOTS } from "@/lib/meetings/schema";
import { dateKey, formatDay, formatSlotShort, pickerDay, TIME_GROUPS, timeKey, upcomingDays, zonedTimeToUtc, type PickerDay } from "@/lib/meetings/time";

interface SlotPickerProps {
  timeZone: string;
  /** Selected times (ISO, UTC). */
  value: ReadonlyArray<string>;
  onChange: (value: string[]) => void;
  /** Client clock when the picker opened (the picker only renders in the browser). */
  now: number;
  /** "Diego elige…": who will pick among the proposals. */
  chooser: string;
  error?: string;
}

const VISIBLE_DAYS = 14;
const LAST_TIME = TIME_GROUPS.at(-1)!.times.at(-1)!;

interface DayStripProps {
  days: ReadonlyArray<PickerDay>;
  active: string;
  marked: ReadonlySet<string>;
  isFull: (key: string) => boolean;
  minDate: string;
  maxDate: string;
  onPick: (key: string) => void;
}

/** Two weeks of days to swipe through, plus "another date" up to the horizon. */
function DayStrip({ days, active, marked, isFull, minDate, maxDate, onPick }: DayStripProps) {
  const labelId = useId();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p id={labelId} className="text-sm font-medium text-ink-soft">
          Día
        </p>
        <label className="relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2 text-sm font-medium text-signal-deep focus-within:ring-2 focus-within:ring-ink/30 hover:bg-signal-wash/60">
          <CalendarPlus className="size-4" aria-hidden />
          Otra fecha
          <input
            type="date"
            min={minDate}
            max={maxDate}
            onChange={(e) => {
              const key = e.target.value;
              if (key >= minDate && key <= maxDate) onPick(key);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Elegir otra fecha"
          />
        </label>
      </div>
      <div role="group" aria-labelledby={labelId} className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {days.map((day) => {
          const selected = day.key === active;
          return (
            <button
              key={day.key}
              type="button"
              aria-pressed={selected}
              aria-label={`${day.long}${marked.has(day.key) ? ", con horas elegidas" : ""}`}
              disabled={isFull(day.key)}
              onClick={() => onPick(day.key)}
              className={cn(
                "relative flex h-[4.5rem] w-14 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border transition-[background-color,border-color,color,transform] duration-200 active:scale-95 disabled:opacity-35",
                selected ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink hover:border-ink",
              )}
            >
              <span className={cn("font-mono text-[10px] tracking-[0.08em] uppercase", selected ? "text-paper/70" : "text-muted")}>{day.label}</span>
              <span className="font-display text-2xl leading-none">{day.day}</span>
              <span className={cn("text-[11px]", selected ? "text-paper/70" : "text-muted")}>{day.month}</span>
              {marked.has(day.key) ? (
                <span className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full", selected ? "bg-glow" : "bg-signal")} aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TimeGridProps {
  day: PickerDay;
  isSelected: (time: string) => boolean;
  isPast: (time: string) => boolean;
  onToggle: (time: string) => void;
}

/** Half-hour chips for one day, morning and afternoon. */
function TimeGrid({ day, isSelected, isPast, onToggle }: TimeGridProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-soft first-letter:uppercase" aria-live="polite">
        {day.long}
      </p>
      <div className="space-y-3">
        {TIME_GROUPS.map((group) => (
          <div key={group.label} role="group" aria-label={`${group.label}, ${day.long}`}>
            <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{group.label}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {group.times.map((time) => {
                const selected = isSelected(time);
                return (
                  <button
                    key={time}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${time}, ${day.long}`}
                    disabled={isPast(time) && !selected}
                    onClick={() => onToggle(time)}
                    className={cn(
                      "h-11 rounded-xl border font-mono text-[0.9rem] tabular-nums transition-[background-color,border-color,color,transform] duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-30",
                      selected
                        ? "border-signal-strong bg-signal-strong text-white shadow-[0_6px_14px_-8px_rgb(194_78_28/0.8)]"
                        : "border-line bg-card text-ink hover:border-ink",
                    )}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProposalsProps {
  value: ReadonlyArray<string>;
  timeZone: string;
  chooser: string;
  notice: string | null;
  onRemove: (iso: string) => void;
}

/** The chosen times as removable pills. */
function Proposals({ value, timeZone, chooser, notice, onRemove }: ProposalsProps) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-3.5 py-3" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">Tus propuestas</p>
        <p className="font-mono text-[11px] text-muted tabular-nums">
          {value.length}/{MAX_SLOTS}
        </p>
      </div>
      {value.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Toca una o varias horas. {chooser} elige la que le venga mejor.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((iso) => (
            <li key={iso}>
              <button
                type="button"
                onClick={() => onRemove(iso)}
                className="group inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink py-1 pr-2 pl-3 text-sm text-paper transition-colors hover:bg-ink-soft"
                aria-label={`Quitar ${formatDay(iso, timeZone)} a las ${timeKey(new Date(iso), timeZone)}`}
              >
                {formatSlotShort(iso, timeZone)}
                <X className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length > 0 && value.length < MAX_SLOTS ? <p className="mt-2 text-xs text-muted">Añadir otra opción le pone más fácil decir que sí.</p> : null}
      {notice ? <p className="mt-2 text-xs text-signal-deep">{notice}</p> : null}
    </div>
  );
}

/**
 * Up to three proposed times: a day strip (two weeks, or any date within the
 * horizon) and half-hour chips. Tapping a time adds it; tapping it again, or
 * its pill, removes it.
 */
export function SlotPicker({ timeZone, value, onChange, now, chooser, error }: SlotPickerProps) {
  const days = useMemo(() => upcomingDays(new Date(now), timeZone, VISIBLE_DAYS), [now, timeZone]);
  const isPastOn = (key: string, time: string) => (zonedTimeToUtc(key, time, timeZone)?.getTime() ?? 0) <= now;
  // Start on today, or tomorrow once today's last time has gone.
  const [activeKey, setActiveKey] = useState(() => (isPastOn(days[0]!.key, LAST_TIME) ? days[1]!.key : days[0]!.key));
  const [extraDay, setExtraDay] = useState<PickerDay | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const strip = extraDay && !days.some((d) => d.key === extraDay.key) ? [...days, extraDay] : days;
  const active = strip.find((d) => d.key === activeKey) ?? strip[0]!;
  const selected = new Set(value.map((iso) => `${dateKey(new Date(iso), timeZone)} ${timeKey(new Date(iso), timeZone)}`));
  const marked = new Set(value.map((iso) => dateKey(new Date(iso), timeZone)));

  function toggle(time: string) {
    const iso = zonedTimeToUtc(active.key, time, timeZone)?.toISOString();
    if (!iso) return;
    if (value.includes(iso)) {
      setNotice(null);
      onChange(value.filter((v) => v !== iso));
    } else if (value.length >= MAX_SLOTS) {
      setNotice(`Ya tienes ${MAX_SLOTS} horas: quita una para añadir otra.`);
    } else {
      setNotice(null);
      onChange([...value, iso].sort());
    }
  }

  function pick(key: string) {
    if (!days.some((d) => d.key === key)) setExtraDay(pickerDay(key));
    setActiveKey(key);
  }

  return (
    <div className="space-y-4">
      <DayStrip
        days={strip}
        active={active.key}
        marked={marked}
        isFull={(key) => TIME_GROUPS.every((g) => g.times.every((t) => isPastOn(key, t)))}
        minDate={days[0]!.key}
        maxDate={dateKey(new Date(now + (HORIZON_DAYS - 1) * 86_400_000), timeZone)}
        onPick={pick}
      />
      <TimeGrid
        day={active}
        isSelected={(time) => selected.has(`${active.key} ${time}`)}
        isPast={(time) => isPastOn(active.key, time)}
        onToggle={toggle}
      />
      <Proposals value={value} timeZone={timeZone} chooser={chooser} notice={notice} onRemove={(iso) => onChange(value.filter((v) => v !== iso))} />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
