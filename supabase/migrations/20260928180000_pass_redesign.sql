-- =============================================================================
-- PassMe — pass redesign (2026-09-28)
--
-- A new family of generative motifs replaces the guilloché set, and the name
-- on the pass gets a typeface of its own. Existing cards move to the closest
-- new motif: sello / senal → orbitas, ondas → cinta (liso stays liso).
--
-- The motif check still accepts the three retired values so the app version
-- deployed before this one keeps saving while both are live; the code maps
-- them on read (toPatternKind in src/lib/card/pattern.ts) and never writes them.
--
-- Keep in sync with src/lib/card/pattern.ts and src/lib/card/design.ts.
-- =============================================================================

alter table public.profiles
  drop constraint profiles_pattern_kind;

update public.profiles
set pattern = case pattern when 'ondas' then 'cinta' else 'orbitas' end
where pattern in ('sello', 'senal', 'ondas');

alter table public.profiles
  alter column pattern set default 'orbitas',
  add constraint profiles_pattern_kind check (
    pattern in (
      'orbitas', 'relieve', 'halo', 'trama', 'cinta', 'rayos', 'monograma', 'liso',
      -- Retired motifs (see header).
      'sello', 'senal', 'ondas'
    )
  ),
  add column typeface text not null default 'clasica',
  add constraint profiles_typeface check (typeface in ('clasica', 'cursiva', 'editorial', 'moderna'));

comment on column public.profiles.pattern_seed is
  'Seeds the generative motif: the card''s own variation. Never shown.';
comment on column public.profiles.typeface is
  'Typeface of the name on the pass: clasica, cursiva, editorial or moderna.';

-- Public read API: same contract as before plus the typeface.
create or replace function public.get_public_card(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', p.slug,
    'full_name', p.full_name,
    'headline', p.headline,
    'company', p.company,
    'location', p.location,
    'pronouns', p.pronouns,
    'bio', p.bio,
    'accent_color', p.accent_color,
    'detail_color', p.detail_color,
    'pattern', p.pattern,
    'pattern_seed', p.pattern_seed,
    'typeface', p.typeface,
    'avatar_path', p.avatar_path,
    'updated_at', p.updated_at,
    'links', coalesce(
      (
        select jsonb_agg(l.value order by l.ordinality)
        from jsonb_array_elements(p.links) with ordinality as l (value, ordinality)
        where l.value -> 'visible' = 'true'::jsonb
      ),
      '[]'::jsonb
    )
  )
  from public.profiles as p
  where p.slug = lower(p_slug)
    and p.is_published
    and p.full_name <> ''
$$;

-- `create or replace` keeps existing grants, but restate them for clarity.
revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated, service_role;
