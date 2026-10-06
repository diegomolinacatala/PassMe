-- =============================================================================
-- UX audit P8.1 + P8.4 (2026-10-06): the owner's time zone and their meeting
-- settings.
--
--   * profiles.time_zone: the owner's IANA zone, taken from the browser when
--     they save in the editor (validated in src/lib/meetings/time.ts). The
--     visitor's picker works in it; emails and pages show each side's zone.
--   * profiles.meeting_settings: what a visitor may propose (formats, weekdays,
--     time range, usual duration, minimum notice) plus the owner's default
--     video link and usual place. Validated in src/lib/meetings/settings.ts;
--     '{}' means the defaults (Mon–Fri, 9:00–19:00, 30 min, 2 h notice).
--   * get_public_card() also returns time_zone and meeting_rules: the settings
--     WITHOUT the video link and the place, which stay private to the owner.
--
-- The app keeps working before this runs: it reads the old shape (no zone,
-- no rules → today's behaviour) and saves without these columns.
-- =============================================================================

alter table public.profiles
  add column if not exists time_zone text not null default 'Europe/Madrid',
  add column if not exists meeting_settings jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_time_zone_format,
  add constraint profiles_time_zone_format check (
    char_length(time_zone) between 1 and 64
    and time_zone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'
  ),
  drop constraint if exists profiles_meeting_settings_shape,
  add constraint profiles_meeting_settings_shape check (
    jsonb_typeof(meeting_settings) = 'object'
    and octet_length(meeting_settings::text) <= 2000
  );

comment on column public.profiles.time_zone is
  'Owner''s IANA time zone (from their browser on save). Meeting pickers and emails use it.';
comment on column public.profiles.meeting_settings is
  'Meeting rules and defaults (src/lib/meetings/settings.ts). videoLink and place are never public.';

-- Public read API: same contract as before plus the owner's zone and the public
-- part of their meeting settings.
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
    'accepts_contact_requests', p.accepts_contact_requests,
    'accepts_meeting_requests', p.accepts_meeting_requests,
    'time_zone', p.time_zone,
    'meeting_rules', p.meeting_settings - 'videoLink' - 'place',
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

revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated, service_role;
