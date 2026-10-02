-- =============================================================================
-- PassMe — meeting requests (2026-10-02)
--
-- "Agendar reunión": whoever scans a card proposes up to three times; PassMe
-- emails the owner, who confirms one with a tap (or proposes others, or
-- declines) from a signed link, and both get a calendar invitation.
--
--   * Owners opt in per card (accepts_meeting_requests).
--   * Requests are created server-side (validated, rate limited) through
--     submit_meeting_request(); every later change is made by the server with
--     the secret key after checking the signed link. Owners can read and delete
--     their own rows; nobody else can touch the table.
--   * Rows go away 90 days after the last proposed time (12 months at most).
--
-- Keep in sync with src/lib/meetings/schema.ts.
-- =============================================================================

alter table public.profiles
  add column accepts_meeting_requests boolean not null default false;

comment on column public.profiles.accepts_meeting_requests is
  'Shows "Agendar reunión" on the public card.';

create table public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- pending: waiting for whoever didn't make the current proposal (proposed_by).
  status text not null default 'pending',
  proposed_by text not null default 'guest',
  slots timestamptz[] not null,
  confirmed_start timestamptz,
  duration_minutes smallint not null default 30,
  format text not null default 'in_person',
  location text not null default '',
  time_zone text not null default 'Europe/Madrid',
  topic text not null default '',
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_company text not null default '',
  -- Optional words from whoever declined or proposed other times.
  response_note text not null default '',
  -- Who declined or cancelled.
  closed_by text,
  -- iCalendar SEQUENCE: bumped on every change so calendars apply updates in order.
  sequence integer not null default 0,
  source text not null default 'direct',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meeting_requests_status check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  constraint meeting_requests_proposed_by check (proposed_by in ('guest', 'owner')),
  constraint meeting_requests_slots check (cardinality(slots) between 1 and 3 and array_position(slots, null) is null),
  constraint meeting_requests_confirmed check (status <> 'confirmed' or confirmed_start is not null),
  constraint meeting_requests_duration check (duration_minutes in (15, 30, 45, 60)),
  constraint meeting_requests_format check (format in ('in_person', 'video', 'phone')),
  constraint meeting_requests_location_length check (char_length(location) <= 300),
  constraint meeting_requests_time_zone_length check (char_length(time_zone) between 1 and 64),
  constraint meeting_requests_topic_length check (char_length(topic) <= 140),
  constraint meeting_requests_guest_name_length check (char_length(guest_name) between 1 and 80),
  -- Same rule as the app (src/lib/card/links.ts): no characters that could smuggle extra addresses.
  constraint meeting_requests_guest_email_format check (
    char_length(guest_email) <= 254
    and guest_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and guest_email !~ '[<>()\[\]\\,;:"?&=%#/]'
  ),
  constraint meeting_requests_guest_phone_format check (guest_phone is null or guest_phone ~ '^\+?[0-9 ().-]{6,30}$'),
  constraint meeting_requests_guest_company_length check (char_length(guest_company) <= 80),
  constraint meeting_requests_response_note_length check (char_length(response_note) <= 300),
  constraint meeting_requests_closed_by check (closed_by is null or closed_by in ('guest', 'owner')),
  constraint meeting_requests_source check (source in ('direct', 'qr', 'share'))
);

create index meeting_requests_profile_created_idx
  on public.meeting_requests (profile_id, created_at desc);

create trigger meeting_requests_set_updated_at
  before update on public.meeting_requests
  for each row execute function public.set_updated_at();

alter table public.meeting_requests enable row level security;

create policy "Owners can read their meeting requests"
  on public.meeting_requests for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "Owners can delete their meeting requests"
  on public.meeting_requests for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

-- Inserts and updates happen server-side (secret key).
revoke all on public.meeting_requests from anon;
revoke insert, update, truncate, references, trigger on public.meeting_requests from authenticated;

/**
 * Stores a proposal for a published card that takes them. Returns
 * {"id", "owner_id"}, {"full": true} when the card already has 30 live
 * proposals waiting for an answer, or null when the card doesn't take them.
 */
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

  -- One proposal at a time per card, so the cap below can't be overshot.
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

  insert into public.meeting_requests (
    profile_id, guest_name, guest_email, guest_phone, guest_company, topic,
    format, location, duration_minutes, time_zone, slots, source
  )
  values (
    owner_id, p_guest_name, p_guest_email, p_guest_phone, coalesce(p_guest_company, ''), coalesce(p_topic, ''),
    p_format, coalesce(p_location, ''), p_duration_minutes, p_time_zone, p_slots, coalesce(p_source, 'direct')
  )
  returning id into new_id;

  -- A card keeps its 500 most recent proposals.
  delete from public.meeting_requests
  where id in (
    select m.id
    from public.meeting_requests as m
    where m.profile_id = owner_id
    order by m.created_at desc
    offset 500
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

-- Retention: proposals go away 90 days after their last proposed time.
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
  contacts integer;
  meetings integer;
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

  delete from public.contact_requests where created_at < now() - interval '24 months';
  get diagnostics contacts = row_count;

  delete from public.meeting_requests as m
  where m.created_at < now() - interval '12 months'
     or (select max(s) from unnest(m.slots) as s) < now() - interval '90 days';
  get diagnostics meetings = row_count;

  return jsonb_build_object(
    'events', events, 'otp_attempts', attempts, 'rate_limits', buckets, 'slugs', slugs,
    'contact_requests', contacts, 'meeting_requests', meetings
  );
end;
$$;

revoke all on function public.cleanup_expired_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_data() to service_role;

-- Public read API: same contract as before plus the meeting flag.
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
