-- =============================================================================
-- PassMe — launch hardening (2026-09-29)
--
-- Security and data-hygiene fixes from the pre-launch audit:
--   1. Slug history: old handles keep redirecting to their owner (printed QRs
--      never break) and can't be claimed by someone else. After an account is
--      deleted its handles stay reserved for 90 days.
--   2. Shared rate limiting: counters live in Postgres so every serverless
--      instance sees the same numbers.
--   3. Analytics: one-round-trip insert that only accepts clicks on links the
--      card actually shows.
--   4. Apple Wallet: at most 10 registered devices per pass (bounds push
--      fan-out) and indexes for the lookups the web service does.
--   5. Smaller things: a size cap on links, no-op saves don't bump the pass
--      version, flat avatar paths only, fewer default privileges.
--   6. cleanup_expired_data(): retention job called daily by /api/cron/cleanup.
--
-- The app keeps working before this migration is applied (it falls back to
-- the previous behaviour), but apply it before sharing cards widely.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Slug history
-- -----------------------------------------------------------------------------
create table public.profile_slug_history (
  slug text primary key,
  -- null = the account was deleted; the slug is quarantined until released_at + 90 days.
  profile_id uuid references public.profiles (id) on delete set null,
  released_at timestamptz not null default now(),

  constraint profile_slug_history_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 32
  )
);

create index profile_slug_history_profile_idx on public.profile_slug_history (profile_id);

comment on table public.profile_slug_history is
  'Previous card handles. They redirect to the current one and stay reserved for their owner.';

alter table public.profile_slug_history enable row level security;
-- No policies on purpose: written by triggers, read through the functions below.

/** True when `p_slug` is held in the history for someone other than `p_profile_id`. */
create or replace function public.slug_reserved_for_other(p_slug text, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_slug_history as h
    where h.slug = p_slug
      and h.profile_id is distinct from p_profile_id
      and (h.profile_id is not null or h.released_at > now() - interval '90 days')
  )
$$;

create or replace function public.profiles_track_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  history_size integer;
begin
  if tg_op = 'UPDATE' and new.slug = old.slug then
    return new;
  end if;

  -- Serialize claims/releases of the same handle across concurrent requests.
  perform pg_advisory_xact_lock(hashtext('passme-slug:' || new.slug));

  if public.slug_reserved_for_other(new.slug, new.id) then
    raise exception 'slug % is reserved', new.slug
      using errcode = 'unique_violation', constraint = 'profile_slug_history_pkey';
  end if;

  if tg_op = 'UPDATE' then
    perform pg_advisory_xact_lock(hashtext('passme-slug:' || old.slug));

    -- Going back to one of your own old handles is always fine (it frees a row).
    select count(*) into history_size
    from public.profile_slug_history as h
    where h.profile_id = new.id and h.slug <> new.slug;
    if history_size >= 10 then
      raise exception 'slug change limit reached for %', new.id
        using errcode = 'check_violation', constraint = 'profiles_slug_change_limit';
    end if;

    insert into public.profile_slug_history (slug, profile_id, released_at)
    values (old.slug, new.id, now())
    on conflict (slug) do update
      set profile_id = excluded.profile_id, released_at = excluded.released_at;
  end if;

  -- The new handle is live again: drop its history row (own, or an expired quarantine).
  delete from public.profile_slug_history as h
  where h.slug = new.slug and (h.profile_id = new.id or h.profile_id is null);

  return new;
end;
$$;

create trigger profiles_track_slug
  before insert or update of slug on public.profiles
  for each row execute function public.profiles_track_slug();

/** Account deletion: keep every handle of the card reserved for 90 days. */
create or replace function public.profiles_release_slugs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same lock as profiles_track_slug, so a parallel claim of this handle waits.
  perform pg_advisory_xact_lock(hashtext('passme-slug:' || old.slug));

  update public.profile_slug_history
  set profile_id = null, released_at = now()
  where profile_id = old.id;

  insert into public.profile_slug_history (slug, profile_id, released_at)
  values (old.slug, null, now())
  on conflict (slug) do update set profile_id = null, released_at = now();

  return old;
end;
$$;

create trigger profiles_release_slugs
  before delete on public.profiles
  for each row execute function public.profiles_release_slugs();

/** Current handle of a published card for one of its old handles (or null). */
create or replace function public.resolve_slug_redirect(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug
  from public.profile_slug_history as h
  join public.profiles as p on p.id = h.profile_id
  where h.slug = lower(p_slug)
    and p.is_published
    and p.full_name <> ''
$$;

revoke all on function public.resolve_slug_redirect(text) from public;
grant execute on function public.resolve_slug_redirect(text) to anon, authenticated, service_role;

-- Also validates the format and the reserved list, and honours the history.
create or replace function public.is_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(p_slug) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(p_slug) between 3 and 32
    and lower(p_slug) <> all (array[
      'about', 'account', 'admin', 'api', 'app', 'assets', 'auth', 'billing',
      'blog', 'dashboard', 'demo', 'docs', 'help', 'login', 'logout', 'me',
      'null', 'pass', 'passes', 'passme', 'pricing', 'privacy', 'profile',
      'root', 'settings', 'signup', 'static', 'status', 'support', 'terms',
      'undefined', 'wallet', 'www'
    ])
    and not exists (
      select 1
      from public.profiles as p
      where p.slug = lower(p_slug)
        and p.id is distinct from (select auth.uid())
    )
    and not public.slug_reserved_for_other(lower(p_slug), (select auth.uid()))
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default:
-- revoke from those roles explicitly, not just from public.
revoke all on function public.is_slug_available(text) from public, anon;
grant execute on function public.is_slug_available(text) to authenticated, service_role;

revoke all on function public.slug_reserved_for_other(text, uuid) from public, anon, authenticated;
revoke all on function public.profiles_track_slug() from public, anon, authenticated;
revoke all on function public.profiles_release_slugs() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Shared rate limiting (fixed window)
-- -----------------------------------------------------------------------------
-- Keys are HMAC-SHA-256 hashes computed by the app (never raw IPs or emails).
-- Unlogged: counters are disposable and don't need WAL or replication.
create unlogged table public.rate_limit_buckets (
  key text primary key,
  hits integer not null,
  reset_at timestamptz not null,

  constraint rate_limit_buckets_key_length check (char_length(key) <= 128)
);

create index rate_limit_buckets_reset_idx on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;
-- No policies on purpose: only the server (secret key) calls rate_limit_hit().

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql
set search_path = ''
as $$
declare
  v_hits integer;
  v_reset timestamptz;
begin
  insert into public.rate_limit_buckets as b (key, hits, reset_at)
  values (p_key, 1, clock_timestamp() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set hits = case when b.reset_at <= clock_timestamp() then 1 else b.hits + 1 end,
        reset_at = case when b.reset_at <= clock_timestamp() then excluded.reset_at else b.reset_at end
  returning b.hits, b.reset_at into v_hits, v_reset;

  -- Opportunistic cleanup: keeps the table small even if the daily cron isn't set up.
  if random() < 0.01 then
    delete from public.rate_limit_buckets where reset_at < clock_timestamp() - interval '10 minutes';
  end if;

  return query
    select v_hits <= p_limit,
           greatest(0, ceil(extract(epoch from (v_reset - clock_timestamp()))))::integer;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Analytics: validated, single round trip
-- -----------------------------------------------------------------------------
create or replace function public.record_card_event(
  p_slug text,
  p_kind text,
  p_source text default 'direct',
  p_link_id text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.profile_events (profile_id, kind, source, link_id)
  select p.id, p_kind, coalesce(p_source, 'direct'), case when p_kind = 'link_click' then p_link_id end
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

revoke all on function public.record_card_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_card_event(text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Apple Wallet registrations
-- -----------------------------------------------------------------------------
create index apple_pass_registrations_serial_only_idx
  on public.apple_pass_registrations (serial_number);
create index apple_pass_registrations_push_token_idx
  on public.apple_pass_registrations (pass_type_id, push_token);

/** Keeps the 10 most recently registered devices per pass. */
create or replace function public.cap_apple_pass_registrations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.apple_pass_registrations as r
  where r.pass_type_id = new.pass_type_id
    and r.serial_number = new.serial_number
    and r.device_library_id not in (
      select k.device_library_id
      from public.apple_pass_registrations as k
      where k.pass_type_id = new.pass_type_id
        and k.serial_number = new.serial_number
      order by k.updated_at desc, k.created_at desc
      limit 10
    );
  return null;
end;
$$;

create trigger apple_pass_registrations_cap
  after insert on public.apple_pass_registrations
  for each row execute function public.cap_apple_pass_registrations();

revoke all on function public.cap_apple_pass_registrations() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Smaller hardening
-- -----------------------------------------------------------------------------
-- 20 links as validated by the app are ~10 KB; this bounds direct API writes.
alter table public.profiles
  add constraint profiles_links_size check (octet_length(links::text) <= 32768);

-- Saving an unchanged card must not look like a new pass version to Apple.
drop trigger profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  when (old.* is distinct from new.*)
  execute function public.set_updated_at();

-- Avatars: one flat folder per user and file names like the app generates (no
-- nested folders the cleanup would miss). A per-user file count can't live in
-- a policy (a policy on storage.objects may not query storage.objects), so the
-- app removes replaced uploads on every save and on account deletion.
drop policy "Users can upload their own avatars" on storage.objects;
create policy "Users can upload their own avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
  );

drop policy "Users can update their own avatars" on storage.objects;
create policy "Users can update their own avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
  );

-- -----------------------------------------------------------------------------
-- 6. Retention
-- -----------------------------------------------------------------------------
create or replace function public.cleanup_expired_data()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  events integer;
  attempts integer;
  buckets integer;
  slugs integer;
begin
  delete from public.profile_events where created_at < now() - interval '400 days';
  get diagnostics events = row_count;

  delete from public.auth_otp_attempts where created_at < now() - interval '1 day';
  get diagnostics attempts = row_count;

  delete from public.rate_limit_buckets where reset_at < now() - interval '1 hour';
  get diagnostics buckets = row_count;

  delete from public.profile_slug_history
  where profile_id is null and released_at < now() - interval '90 days';
  get diagnostics slugs = row_count;

  return jsonb_build_object('events', events, 'otp_attempts', attempts, 'rate_limits', buckets, 'slugs', slugs);
end;
$$;

revoke all on function public.cleanup_expired_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_data() to service_role;

create index auth_otp_attempts_created_idx on public.auth_otp_attempts (created_at);

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on public.profile_slug_history from anon, authenticated;
revoke all on public.rate_limit_buckets from anon, authenticated;
-- PostgREST never needs these; defense in depth.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- Functions created by later migrations no longer get Supabase's automatic
-- EXECUTE grant for the API roles. (PUBLIC's built-in EXECUTE can't be removed
-- per schema: keep writing `revoke ... from public` for each new function.)
alter default privileges in schema public revoke execute on functions from anon, authenticated;
