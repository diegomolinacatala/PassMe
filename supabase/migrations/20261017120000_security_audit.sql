-- =============================================================================
-- PassMe — security audit hardening (2026-10-17)
--
-- Safe to run BEFORE the app that goes with it is deployed: every function keeps
-- its signature and return shape, nothing here is a new call the app depends on,
-- and rows that already exist keep working (see each section).
--
--   1. Newly reserved handles (soporte, ayuda, hola, ...; nothing starting with
--      "passme-"), enforced only when a handle is claimed or changed.
--   2. Avatars: at most 20 files per user, 1 MiB per file.
--   3. get_public_card(): meeting rules published by allowlist.
--   4. Meetings: at most 2 live proposals per guest email and card, the 500-row
--      history never evicts live meetings, no control characters in guest emails.
--   5. Retired motifs converted and no longer accepted.
--   6. Shape of every stored link (NOT VALID: existing rows are not checked).
--   7. Privileges: set_updated_at() closed to PUBLIC, no DELETE on profiles for
--      authenticated.
--   8. Indexes for the nightly retention job and the unanswered-proposals cron.
--   9. auth.users: the app never uses passwords, so no password is ever stored
--      (closes pre-account takeover: someone registering your email with their
--      password before you ever sign in).
--
-- Optional checks to run in the SQL Editor first (all should return no rows):
--   select slug from public.profiles where slug like 'passme-%' or slug in
--     ('soporte','ayuda','hola','equipo','seguridad','getpassme','oficial','crear',
--      'reunion','privacidad','terminos','aviso-legal');           -- owners keep these
--   select id from auth.users where encrypted_password is not null
--     and encrypted_password <> '';               -- cleared by section 9
--
-- Keep in sync with: src/lib/card/slug.ts (section 1), src/lib/card/links.ts
-- (section 6), src/lib/card/pattern.ts (section 5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Newly reserved handles
-- -----------------------------------------------------------------------------
-- The words reserved at launch live in the CHECK profiles_slug_not_reserved,
-- which validates every row on every update. Words added later can't go there:
-- an owner who already uses one would be unable to save their card. They are
-- enforced by the slug trigger instead, which only looks at inserts and at
-- updates that change the handle, and by is_slug_available(). Existing owners
-- keep their handle (they can't come back to it after leaving it).
create or replace function public.slug_is_newly_reserved(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_slug like 'passme-%'
    or p_slug = any (array[
      'soporte', 'ayuda', 'hola', 'equipo', 'seguridad', 'getpassme', 'oficial',
      'crear', 'reunion', 'privacidad', 'terminos', 'aviso-legal'
    ])
$$;

revoke all on function public.slug_is_newly_reserved(text) from public, anon, authenticated;

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

  -- unique_violation, like a taken handle: the app already retries with another one.
  if public.slug_is_newly_reserved(new.slug) then
    raise exception 'slug % is reserved', new.slug
      using errcode = 'unique_violation', constraint = 'profile_slug_newly_reserved';
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

revoke all on function public.profiles_track_slug() from public, anon, authenticated;

-- Same as before plus the newly reserved handles; a handle you already own is
-- still "available" to you.
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
    and (
      not public.slug_is_newly_reserved(lower(p_slug))
      or exists (
        select 1
        from public.profiles as p
        where p.slug = lower(p_slug)
          and p.id = (select auth.uid())
      )
    )
    and not exists (
      select 1
      from public.profiles as p
      where p.slug = lower(p_slug)
        and p.id is distinct from (select auth.uid())
    )
    and not public.slug_reserved_for_other(lower(p_slug), (select auth.uid()))
$$;

revoke all on function public.is_slug_available(text) from public, anon;
grant execute on function public.is_slug_available(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Avatars: a file cap per user and a tighter size limit
-- -----------------------------------------------------------------------------
-- The browser uploads straight to Storage. The editor only produces a 320 px
-- JPEG (50-150 KB) and the app deletes replaced uploads on every save, so 20
-- files and 1 MiB are far above legitimate use. A policy can't query
-- storage.objects itself (it would recurse into its own RLS): a SECURITY
-- DEFINER counter does it, for the caller's own folder only.
update storage.buckets set file_size_limit = 1048576 where id = 'avatars';

create or replace function public.own_avatar_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects as o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] = (select auth.uid())::text
$$;

revoke all on function public.own_avatar_count() from public, anon, authenticated;
grant execute on function public.own_avatar_count() to authenticated;

drop policy "Users can upload their own avatars" on storage.objects;
create policy "Users can upload their own avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
    and (select public.own_avatar_count()) < 20
  );

-- -----------------------------------------------------------------------------
-- 3. get_public_card(): meeting rules by allowlist
-- -----------------------------------------------------------------------------
-- Same contract as before. `meeting_rules` used to be "the settings minus
-- videoLink and place": a new private key would have gone public by default.
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
    'meeting_rules', jsonb_strip_nulls(jsonb_build_object(
      'formats', p.meeting_settings -> 'formats',
      'weekdays', p.meeting_settings -> 'weekdays',
      'start', p.meeting_settings -> 'start',
      'end', p.meeting_settings -> 'end',
      'duration', p.meeting_settings -> 'duration',
      'noticeMinutes', p.meeting_settings -> 'noticeMinutes'
    )),
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

-- -----------------------------------------------------------------------------
-- 4. Meetings
-- -----------------------------------------------------------------------------
-- (a) One address can't fill a card's inbox: at most 2 live proposals per guest
--     email and card (answered with {"full": true}, like the 30-per-card cap).
-- (b) The 500 most recent proposals are kept as before, but the trim only drops
--     rows that are over (declined or cancelled) or entirely in the past, so a
--     flood of old closed rows can never delete a pending or confirmed meeting.
create or replace function public.submit_meeting_request(
  p_slug text,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guest_company text,
  p_topic text,
  p_format text,
  p_location text,
  p_duration_minutes integer,
  p_time_zone text,
  p_slots timestamptz[],
  p_source text default 'direct'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
  waiting integer;
  from_guest integer;
  new_id uuid;
begin
  select p.id into owner_id
  from public.profiles as p
  where p.slug = lower(p_slug)
    and p.is_published
    and p.accepts_meeting_requests
    and p.full_name <> '';
  if owner_id is null then
    return null;
  end if;

  if exists (select 1 from unnest(p_slots) as s where s <= now()) then
    raise exception 'meeting slots must be in the future' using errcode = '22023';
  end if;

  -- One proposal at a time per card, so the caps below can't be overshot.
  perform pg_advisory_xact_lock(hashtextextended('meeting_requests:' || owner_id::text, 0));

  -- Only proposals still waiting count: expired ones go with the daily cleanup.
  select count(*) into waiting
  from public.meeting_requests as m
  where m.profile_id = owner_id
    and m.status = 'pending'
    and exists (select 1 from unnest(m.slots) as s where s > now());
  if waiting >= 30 then
    return jsonb_build_object('full', true);
  end if;

  select count(*) into from_guest
  from public.meeting_requests as m
  where m.profile_id = owner_id
    and m.status = 'pending'
    and lower(m.guest_email) = lower(p_guest_email)
    and exists (select 1 from unnest(m.slots) as s where s > now());
  if from_guest >= 2 then
    -- 'guest': this visitor already has two open proposals (the app says so, not "the card is full").
    return jsonb_build_object('full', true, 'guest', true);
  end if;

  insert into public.meeting_requests (
    profile_id, guest_name, guest_email, guest_phone, guest_company, topic,
    format, location, duration_minutes, time_zone, slots, source
  )
  values (
    owner_id, p_guest_name, p_guest_email, p_guest_phone, coalesce(p_guest_company, ''), coalesce(p_topic, ''),
    p_format, coalesce(p_location, ''), p_duration_minutes, p_time_zone, p_slots, coalesce(p_source, 'direct')
  )
  returning id into new_id;

  -- A card keeps its 500 most recent proposals; live meetings are never trimmed.
  delete from public.meeting_requests as d
  where d.id in (
    select m.id
    from public.meeting_requests as m
    where m.profile_id = owner_id
    order by m.created_at desc, m.id
    offset 500
  )
  and (
    d.status in ('declined', 'cancelled')
    or (
      not exists (select 1 from unnest(d.slots) as s where s > now())
      and coalesce(d.confirmed_start, '-infinity'::timestamptz) <= now()
    )
  );

  return jsonb_build_object('id', new_id, 'owner_id', owner_id);
end;
$$;

revoke all on function public.submit_meeting_request(
  text, text, text, text, text, text, text, text, integer, text, timestamptz[], text
) from public, anon, authenticated;
grant execute on function public.submit_meeting_request(
  text, text, text, text, text, text, text, text, integer, text, timestamptz[], text
) to service_role;

-- (c) The guest's address ends up in email headers: no control characters
--     (C0, DEL, C1, line and paragraph separators). NOT VALID so rows that
--     already exist are not rechecked; every new row is.
alter table public.meeting_requests drop constraint if exists meeting_requests_guest_email_no_control;
alter table public.meeting_requests
  add constraint meeting_requests_guest_email_no_control
  check (guest_email !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029]') not valid;

-- -----------------------------------------------------------------------------
-- 5. Retired motifs
-- -----------------------------------------------------------------------------
-- The app reads them as their successors (toPatternKind) and never writes them.
-- Runs before the link constraint of section 6 so a row with odd old links can't
-- stop this update.
update public.profiles
set pattern = case pattern
  when 'orbitas' then 'arco'
  when 'relieve' then 'corriente'
  when 'trama' then 'halo'
  when 'rayos' then 'persiana'
end
where pattern in ('orbitas', 'relieve', 'trama', 'rayos');

alter table public.profiles
  drop constraint profiles_pattern_kind,
  add constraint profiles_pattern_kind check (
    pattern in ('arco', 'corriente', 'persiana', 'pliegue', 'halo', 'cinta', 'monograma', 'liso')
  );

-- -----------------------------------------------------------------------------
-- 6. Shape of every stored link
-- -----------------------------------------------------------------------------
-- The database only checked "an array of at most 20 elements", so a signed-in
-- user talking to the API directly could store anything inside it. The app
-- re-validates on read (sanitizeStoredLinks); this makes the database refuse it
-- too. The value limit is loose on purpose: the app's 300 characters apply
-- before normalisation, which can lengthen a value.
--
-- NOT VALID: existing rows are not checked, but any later UPDATE of a row that
-- does not satisfy it fails until its links are rewritten (the editor always
-- saves them sanitised). To find such rows, and then validate:
--   select id from public.profiles where not public.links_are_well_formed(links);
--   alter table public.profiles validate constraint profiles_links_well_formed;
create or replace function public.links_are_well_formed(p_links jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- The inner coalesce matters: a missing key makes the test NULL, and bool_and
  -- ignores NULLs, so an element without `visible` would otherwise pass.
  select coalesce(bool_and(coalesce(
    jsonb_typeof(l.value) = 'object'
    and jsonb_typeof(l.value -> 'id') = 'string'
    and (l.value ->> 'id') ~ '^[A-Za-z0-9_-]{6,40}$'
    and jsonb_typeof(l.value -> 'kind') = 'string'
    and (l.value ->> 'kind') in (
      'email', 'phone', 'whatsapp', 'linkedin', 'website', 'instagram', 'x',
      'github', 'tiktok', 'youtube', 'telegram', 'booking', 'custom'
    )
    and jsonb_typeof(l.value -> 'value') = 'string'
    and char_length(l.value ->> 'value') <= 2048
    and jsonb_typeof(l.value -> 'visible') = 'boolean'
    and (
      not (l.value ? 'label')
      or (jsonb_typeof(l.value -> 'label') = 'string' and char_length(l.value ->> 'label') <= 80)
    ),
    false
  )), true)
  from jsonb_array_elements(case when jsonb_typeof(p_links) = 'array' then p_links else '[]'::jsonb end) as l (value)
$$;

revoke all on function public.links_are_well_formed(jsonb) from public, anon, authenticated;
-- A CHECK runs the function as the role that writes the row.
grant execute on function public.links_are_well_formed(jsonb) to authenticated, service_role;

-- The name sorts after profiles_links_shape / profiles_links_size, so those keep reporting first.
alter table public.profiles drop constraint if exists profiles_links_well_formed;
alter table public.profiles
  add constraint profiles_links_well_formed check (public.links_are_well_formed(links)) not valid;

-- -----------------------------------------------------------------------------
-- 7. Privileges
-- -----------------------------------------------------------------------------
-- set_updated_at() was revoked from anon/authenticated but kept PUBLIC's default
-- EXECUTE. (A trigger function can't be called through the API; this just keeps
-- the "every function is closed to PUBLIC" rule true. Triggers still fire.)
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Accounts are deleted through auth.admin.deleteUser (the cascade), never by the
-- user: no policy allows it, so take the privilege away as well.
revoke delete on public.profiles from authenticated;

-- -----------------------------------------------------------------------------
-- 8. Indexes
-- -----------------------------------------------------------------------------
-- cleanup_expired_data() deletes profile_events by created_at alone; the only
-- index starts with profile_id (a full scan nightly on PostgreSQL <= 17).
create index if not exists profile_events_created_idx on public.profile_events (created_at);

-- The daily cron looks for unanswered visitor proposals (src/lib/data/meetings.ts).
create index if not exists meeting_requests_unanswered_idx
  on public.meeting_requests (updated_at desc)
  where status = 'pending' and proposed_by = 'guest';

-- -----------------------------------------------------------------------------
-- 9. No passwords in auth.users
-- -----------------------------------------------------------------------------
-- PassMe only signs in with an emailed code or Google, but Supabase Auth also
-- accepts email + password registrations. Someone could register YOUR address
-- with THEIR password before you ever sign in; when you then sign in with the
-- code, that account is confirmed as yours and their password still works
-- (pre-account takeover). GoTrue stores a passwordless user with an empty
-- encrypted_password (or NULL): this trigger keeps it that way, whatever is
-- written. NULL stays NULL; anything else becomes ''.
--
-- It fires on inserts and whenever encrypted_password is part of an UPDATE.
-- Passwords stored before this migration are cleared right below (the app never
-- sets one, so any that exists is a pre-registration or a dashboard test user),
-- and sessions that were opened with a password are revoked: a password JWT is
-- still a valid token for the database API, not only for the app.
--
-- ROLLBACK, if signing in ever misbehaves:
--   drop trigger passme_blank_password on auth.users;
create or replace function public.blank_auth_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is not null then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke all on function public.blank_auth_password() from public, anon, authenticated;

drop trigger if exists passme_blank_password on auth.users;
create trigger passme_blank_password
  before insert or update of encrypted_password on auth.users
  for each row execute function public.blank_auth_password();

-- Clear what is already stored (the trigger above turns any non-null value into '').
update auth.users
set encrypted_password = ''
where encrypted_password is not null and encrypted_password <> '';

-- Revoke sessions that were opened with a password (their refresh tokens go with
-- them). Guarded: these GoTrue tables exist on Supabase, not in a bare Postgres.
do $$
begin
  if to_regclass('auth.sessions') is not null and to_regclass('auth.mfa_amr_claims') is not null then
    delete from auth.sessions as s
    using auth.mfa_amr_claims as c
    where c.session_id = s.id and c.authentication_method = 'password';
  end if;
end;
$$;
