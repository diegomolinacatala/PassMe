"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { Field, inputClasses } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/meetings/model";
import { FORMAT_LABELS, MEETING_DURATIONS, MEETING_FORMATS, MEETING_LIMITS, type MeetingDuration } from "@/lib/meetings/schema";
import {
  NOTICE_OPTIONS,
  noticeLabel,
  PLACE_MAX,
  RANGE_ENDS,
  RANGE_STARTS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type MeetingSettings,
} from "@/lib/meetings/settings";

interface MeetingSettingsFieldProps {
  value: MeetingSettings;
  onChange: (patch: Partial<MeetingSettings>) => void;
  /** Server errors keyed like "meetingSettings.videoLink". */
  errors: Record<string, string>;
}

const chip =
  "inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:cursor-not-allowed";

/** Toggles a value in a list, never leaving it empty (the last one can't go). */
function toggle<T>(list: ReadonlyArray<T>, value: T, order: ReadonlyArray<T>): T[] {
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return next.length === 0 ? [...list] : order.filter((v) => next.includes(v));
}

/**
 * «Ajustes de reuniones» (UX audit P8.4), folded under the meetings switch:
 * what visitors may propose and the defaults offered when confirming. The
 * card's picker only shows what these allow, and the server checks again.
 */
export function MeetingSettingsField({ value, onChange, errors }: MeetingSettingsFieldProps) {
  const formatsId = useId();
  const daysId = useId();
  const select = cn(inputClasses(), "pr-8");
  const lonely = (count: number, on: boolean) => on && count === 1;

  return (
    <details className="group mt-4 rounded-2xl border border-field-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        Ajustes de reuniones
        <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="space-y-5 border-t hairline px-4 pt-4 pb-5">
        <div role="group" aria-labelledby={formatsId}>
          <p id={formatsId} className="mb-2 text-sm font-medium text-ink-soft">
            Cómo os podéis ver
          </p>
          <div className="flex flex-wrap gap-2">
            {MEETING_FORMATS.map((format) => {
              const on = value.formats.includes(format);
              return (
                <button
                  key={format}
                  type="button"
                  aria-pressed={on}
                  disabled={lonely(value.formats.length, on)}
                  onClick={() => onChange({ formats: toggle(value.formats, format, MEETING_FORMATS) })}
                  className={cn(chip, "border-field-border text-ink hover:border-ink")}
                >
                  {FORMAT_LABELS[format]}
                </button>
              );
            })}
          </div>
        </div>

        <div role="group" aria-labelledby={daysId}>
          <p id={daysId} className="mb-2 text-sm font-medium text-ink-soft">
            Días
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const on = value.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_LABELS[day]!.long}
                  disabled={lonely(value.weekdays.length, on)}
                  onClick={() => onChange({ weekdays: toggle(value.weekdays, day, WEEKDAYS) })}
                  className={cn(chip, "w-11 border-field-border px-0 text-ink hover:border-ink")}
                >
                  {WEEKDAY_LABELS[day]!.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde las">
            {(props) => (
              <select
                {...props}
                value={value.start}
                onChange={(e) => {
                  const start = e.target.value;
                  onChange(start < value.end ? { start } : { start, end: RANGE_ENDS.find((t) => t > start) ?? value.end });
                }}
                className={select}
              >
                {RANGE_STARTS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Hasta las" hint="La última hora que te pueden proponer empieza antes." error={errors["meetingSettings.end"]}>
            {(props) => (
              <select {...props} value={value.end} onChange={(e) => onChange({ end: e.target.value })} className={select}>
                {RANGE_ENDS.filter((time) => time > value.start).map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración habitual">
            {(props) => (
              <select
                {...props}
                value={value.duration}
                onChange={(e) => onChange({ duration: Number(e.target.value) as MeetingDuration })}
                className={select}
              >
                {MEETING_DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Antelación mínima">
            {(props) => (
              <select {...props} value={value.noticeMinutes} onChange={(e) => onChange({ noticeMinutes: Number(e.target.value) })} className={select}>
                {NOTICE_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {noticeLabel(minutes)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {value.formats.includes("video") ? (
          <Field
            label="Tu enlace de videollamada"
            optional
            hint="De Meet, Zoom, Teams, Whereby, Jitsi o Webex. Te lo proponemos al confirmar una videollamada; nadie lo ve antes."
            error={errors["meetingSettings.videoLink"]}
          >
            {(props) => (
              <input
                {...props}
                type="url"
                inputMode="url"
                value={value.videoLink}
                maxLength={MEETING_LIMITS.videoLink}
                onChange={(e) => onChange({ videoLink: e.target.value })}
                placeholder="https://meet.google.com/…"
                className={inputClasses()}
              />
            )}
          </Field>
        ) : null}
        {value.formats.includes("in_person") ? (
          <Field
            label="Tu lugar habitual"
            optional
            hint="Te lo proponemos al confirmar una reunión en persona; nadie lo ve antes."
            error={errors["meetingSettings.place"]}
          >
            {(props) => (
              <input
                {...props}
                value={value.place}
                maxLength={PLACE_MAX}
                onChange={(e) => onChange({ place: e.target.value })}
                placeholder="Café Central, Madrid"
                className={inputClasses()}
              />
            )}
          </Field>
        ) : null}
      </div>
    </details>
  );
}
