-- =============================================================================
-- PassMe — card design (2026-09-28)
--
-- Adds the editable pass design: a detail color for the guilloché pattern and
-- labels, the pattern style, and the seed that makes every card's pattern (and
-- its "seal number") unique. New cards start with the "Naranja" theme.
--
-- Keep in sync with src/lib/card/design.ts and src/lib/card/pattern.ts.
-- =============================================================================

alter table public.profiles
  add column detail_color text,
  add column pattern text not null default 'sello',
  add column pattern_seed integer not null default floor(random() * 1000000)::integer;

alter table public.profiles
  alter column accent_color set default '#EF7A4A',
  add constraint profiles_detail_color_format check (
    detail_color is null or detail_color ~ '^#[0-9a-fA-F]{6}$'
  ),
  add constraint profiles_pattern_kind check (pattern in ('sello', 'ondas', 'senal', 'liso')),
  add constraint profiles_pattern_seed_range check (pattern_seed between 0 and 999999);

comment on column public.profiles.detail_color is
  'Pattern/seal/label color of the pass. Null = derived from accent_color.';
comment on column public.profiles.pattern_seed is
  'Seeds the generative pattern; shown on the pass as the card''s seal number.';

-- Public read API: same contract as before plus the design fields.
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
