-- =============================================================================
-- PassMe — motif refresh (2026-10-01)
--
-- Four motifs are retired and replaced by a calmer set: arco, corriente,
-- persiana and pliegue; halo, cinta, monograma and liso stay. New cards start
-- on arco.
--
-- Safe to run before or after deploying the app that uses them:
--   * Cards keep their stored motif. The app reads the retired ones as their
--     closest successor (toPatternKind in src/lib/card/pattern.ts:
--     orbitas → arco, relieve → corriente, trama → halo, rayos → persiana)
--     and writes the new value the next time the owner saves.
--   * The check keeps accepting the four retired values, which the app version
--     deployed before this one still writes.
--   * The motifs retired in 20260928180000 (sello, senal, ondas) are moved to
--     values both versions understand and are no longer accepted.
--
-- Keep in sync with src/lib/card/pattern.ts.
-- =============================================================================

alter table public.profiles
  drop constraint profiles_pattern_kind;

update public.profiles
set pattern = case pattern when 'ondas' then 'cinta' else 'orbitas' end
where pattern in ('sello', 'senal', 'ondas');

alter table public.profiles
  alter column pattern set default 'arco',
  add constraint profiles_pattern_kind check (
    pattern in (
      'arco', 'corriente', 'persiana', 'pliegue', 'halo', 'cinta', 'monograma', 'liso',
      -- Retired motifs (see header).
      'orbitas', 'relieve', 'trama', 'rayos'
    )
  );

comment on column public.profiles.pattern is
  'Motif of the pass: arco, corriente, persiana, pliegue, halo, cinta, monograma or liso. Retired values are read as their successor.';
