-- =============================================================================
-- PassMe — initial schema
--
-- Apply with `npx supabase db push` (after `supabase link`) or paste the whole
-- file into Supabase Dashboard → SQL Editor → Run. Run it once on a fresh
-- project (later changes go in new, timestamped migration files).
--
-- Security model
--   * profiles: owners read/write their own row. Anonymous visitors never touch
--     the table directly; they call get_public_card(), which returns only
--     published cards and only the links marked visible.
--   * profile_events: written by the server with the secret key (bypasses RLS),
--     readable by the owner for stats.
--   * wallet_pass_secrets / apple_pass_registrations: server-only (RLS on, no
--     policies), used by the Apple Wallet web service.
--   * storage bucket "avatars": public URLs, but users can only write inside
--     the folder named after their own user id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: one contact card per user
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  slug text not null,
  full_name text not null default '',
  headline text not null default '',
  company text not null default '',
  location text not null default '',
  pronouns text not null default '',
  bio text not null default '',
  accent_color text not null default '#141414',
  avatar_path text,
  links jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_slug_key unique (slug),
  -- Keep in sync with src/lib/card/slug.ts
  constraint profiles_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 32
  ),
  constraint profiles_slug_not_reserved check (
    slug <> all (array[
      'about', 'account', 'admin', 'api', 'app', 'assets', 'auth', 'billing',
      'blog', 'dashboard', 'demo', 'docs', 'help', 'login', 'logout', 'me',
      'null', 'pass', 'passes', 'passme', 'pricing', 'privacy', 'profile',
      'root', 'settings', 'signup', 'static', 'status', 'support', 'terms',
      'undefined', 'wallet', 'www'
    ])
  ),
  constraint profiles_full_name_length check (char_length(full_name) <= 80),
  constraint profiles_headline_length check (char_length(headline) <= 80),
  constraint profiles_company_length check (char_length(company) <= 80),
  constraint profiles_location_length check (char_length(location) <= 80),
  constraint profiles_pronouns_length check (char_length(pronouns) <= 30),
  constraint profiles_bio_length check (char_length(bio) <= 280),
  constraint profiles_accent_color_format check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  -- Keep in sync with src/lib/card/avatar.ts
  constraint profiles_avatar_path_owner check (
    avatar_path is null
    or (
      split_part(avatar_path, '/', 1) = id::text
      and avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
    )
  ),
  constraint profiles_links_shape check (
    jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 20
  )
);

comment on table public.profiles is 'One PassMe contact card per auth user.';
comment on column public.profiles.links is
  'Ordered array of {id, kind, value, label?, visible}. Validated by the app (src/lib/card/schema.ts).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Owners can read their profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Owners can create their profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Owners can update their profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy: cards are removed by deleting the auth user (cascade).

-- -----------------------------------------------------------------------------
-- Public read API
-- -----------------------------------------------------------------------------
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

comment on function public.get_public_card(text) is
  'Published card by slug with hidden links stripped. Safe to call with the publishable (anon) key.';

revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated, service_role;

create or replace function public.is_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles as p
    where p.slug = lower(p_slug)
      and p.id is distinct from (select auth.uid())
  )
$$;

revoke all on function public.is_slug_available(text) from public;
grant execute on function public.is_slug_available(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Analytics events (no IPs, no cookies — just counters)
-- -----------------------------------------------------------------------------
create table public.profile_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  source text not null default 'direct',
  link_id text,
  created_at timestamptz not null default now(),

  constraint profile_events_kind check (
    kind in ('view', 'vcard', 'link_click', 'pass_apple', 'pass_google')
  ),
  constraint profile_events_source check (source in ('direct', 'qr', 'share')),
  constraint profile_events_link_id_length check (link_id is null or char_length(link_id) <= 40)
);

create index profile_events_profile_created_idx
  on public.profile_events (profile_id, created_at desc);

alter table public.profile_events enable row level security;

create policy "Owners can read their events"
  on public.profile_events for select
  to authenticated
  using ((select auth.uid()) = profile_id);

-- Inserts happen server-side with the secret key only.

create or replace function public.get_card_stats(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select greatest(1, least(coalesce(p_days, 30), 365)) as days
  ),
  ev as (
    select e.kind, e.source, e.link_id, e.created_at
    from public.profile_events as e, params
    where e.profile_id = (select auth.uid())
      and e.created_at >= now() - make_interval(days => params.days)
  )
  select jsonb_build_object(
    'days', (select days from params),
    'views', (select count(*) from ev where kind = 'view'),
    'qr_views', (select count(*) from ev where kind = 'view' and source = 'qr'),
    'vcard_downloads', (select count(*) from ev where kind = 'vcard'),
    'wallet_adds', (select count(*) from ev where kind in ('pass_apple', 'pass_google')),
    'link_clicks', coalesce(
      (
        select jsonb_object_agg(t.link_id, t.clicks)
        from (
          select link_id, count(*) as clicks
          from ev
          where kind = 'link_click' and link_id is not null
          group by link_id
        ) as t
      ),
      '{}'::jsonb
    ),
    'daily_views', coalesce(
      (
        select jsonb_agg(jsonb_build_object('day', t.day, 'count', t.views) order by t.day)
        from (
          select (created_at at time zone 'utc')::date as day, count(*) as views
          from ev
          where kind = 'view'
          group by 1
        ) as t
      ),
      '[]'::jsonb
    )
  )
$$;

revoke all on function public.get_card_stats(integer) from public;
grant execute on function public.get_card_stats(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Wallet (Apple PassKit web service)
-- -----------------------------------------------------------------------------
create table public.wallet_pass_secrets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- Shared secret Apple Wallet sends back as "Authorization: ApplePass <token>".
  apple_auth_token text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),

  constraint wallet_pass_secrets_token_length check (char_length(apple_auth_token) >= 32)
);

alter table public.wallet_pass_secrets enable row level security;
-- No policies on purpose: only the server (secret key) can read these.

create table public.apple_pass_registrations (
  device_library_id text not null,
  pass_type_id text not null,
  serial_number uuid not null references public.profiles (id) on delete cascade,
  push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (device_library_id, pass_type_id, serial_number),
  constraint apple_pass_registrations_device_length check (char_length(device_library_id) <= 128),
  constraint apple_pass_registrations_type_length check (char_length(pass_type_id) <= 128),
  constraint apple_pass_registrations_token_length check (char_length(push_token) <= 256)
);

create index apple_pass_registrations_serial_idx
  on public.apple_pass_registrations (pass_type_id, serial_number);

create trigger apple_pass_registrations_set_updated_at
  before update on public.apple_pass_registrations
  for each row execute function public.set_updated_at();

alter table public.apple_pass_registrations enable row level security;
-- No policies on purpose: only the server (secret key) can read these.

-- -----------------------------------------------------------------------------
-- Login hardening: failed one-time-code attempts per email
-- -----------------------------------------------------------------------------
-- The in-app limiter keys on IP and lives in each serverless instance's memory.
-- This table gives a shared, per-email lockout so a 6-digit code cannot be
-- brute-forced from many IPs/instances. Emails are stored as SHA-256 hashes.
create table public.auth_otp_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  created_at timestamptz not null default now(),

  constraint auth_otp_attempts_hash_format check (email_hash ~ '^[0-9a-f]{64}$')
);

create index auth_otp_attempts_email_created_idx
  on public.auth_otp_attempts (email_hash, created_at desc);

alter table public.auth_otp_attempts enable row level security;
-- No policies on purpose: only the server (secret key) can read or write.

-- -----------------------------------------------------------------------------
-- Storage: avatars
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket → files are served by URL without a select policy. We only let
-- owners list their own folder so nobody can enumerate every user's avatar.
create policy "Users can list their own avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload their own avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can update their own avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
