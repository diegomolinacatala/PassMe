-- =============================================================================
-- PassMe — CRM insights (2026-10-21)
--
-- Safe to run BEFORE the app that goes with it is deployed: nothing existing
-- changes shape, and the app falls back to the old calls until this is applied.
--
--   1. Card events also say which kind of device (iPhone, Android, other) and
--      which country (two letters, from the hosting provider's IP lookup) they
--      came from. The IP itself is never stored. Old rows stay NULL.
--   2. record_card_event_v2(): record_card_event() plus those two values.
--   3. profile_referrals: whose card led each new card to be created, and how
--      the newcomer reached it (scan, shared link). Read and written only with
--      the secret key (onboarding and the private CRM).
--
-- Keep in sync with: src/lib/platform.ts (section 1), src/lib/data/referrals.ts
-- (section 3).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Device and country on card events
-- -----------------------------------------------------------------------------
alter table public.profile_events
  add column if not exists platform text,
  add column if not exists country text;

-- Guarded, so pasting the file twice in the SQL Editor doesn't stop halfway.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_events_platform') then
    alter table public.profile_events
      add constraint profile_events_platform check (platform is null or platform in ('ios', 'android', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_events_country') then
    alter table public.profile_events
      add constraint profile_events_country check (country is null or country ~ '^[A-Z]{2}$');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. record_card_event_v2()
-- -----------------------------------------------------------------------------
-- A new name instead of an overload: PostgREST picks functions by their
-- argument names, and two versions with defaults would be ambiguous. Anything
-- that isn't a known device or a two-letter country is stored as NULL.
create or replace function public.record_card_event_v2(
  p_slug text,
  p_kind text,
  p_source text,
  p_link_id text,
  p_platform text,
  p_country text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.profile_events (profile_id, kind, source, link_id, platform, country)
  select p.id,
         p_kind,
         coalesce(p_source, 'direct'),
         case when p_kind = 'link_click' then p_link_id end,
         case when p_platform in ('ios', 'android', 'other') then p_platform end,
         case when p_country ~ '^[A-Z]{2}$' then p_country end
  from public.profiles as p
  where p.slug = lower(p_slug)
    and p.is_published
    and (
      p_kind <> 'link_click'
      or exists (
        select 1
        from jsonb_array_elements(p.links) as l (value)
        where l.value ->> 'id' = p_link_id
          and l.value -> 'visible' = 'true'::jsonb
      )
    );
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

revoke all on function public.record_card_event_v2(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_card_event_v2(text, text, text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Who brought whom
-- -----------------------------------------------------------------------------
-- One row per card created after this migration. referrer_id is NULL when the
-- newcomer arrived on their own, or once the referrer deletes their account.
create table if not exists public.profile_referrals (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid references public.profiles (id) on delete set null,
  via text not null default 'direct',
  created_at timestamptz not null default now(),
  constraint profile_referrals_via check (via in ('direct', 'qr', 'share')),
  constraint profile_referrals_not_self check (referrer_id is null or referrer_id <> profile_id)
);

create index if not exists profile_referrals_referrer_idx on public.profile_referrals (referrer_id);

-- No policies: the browser roles can't see or touch it; the secret key bypasses RLS.
alter table public.profile_referrals enable row level security;
revoke all on table public.profile_referrals from public, anon, authenticated;
