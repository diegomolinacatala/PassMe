-- =============================================================================
-- PassMe — contact exchange (2026-09-29)
--
-- Visitors of a card can leave their own details for the owner ("Te dejo mi
-- contacto"). Owners opt in per card; submissions go through the server
-- (validated, rate limited) and only the owner can read or delete them.
--
-- Keep in sync with src/lib/card/contact.ts.
-- =============================================================================

alter table public.profiles
  add column accepts_contact_requests boolean not null default false;

comment on column public.profiles.accepts_contact_requests is
  'Shows the "leave your contact" form on the public card.';

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text not null default '',
  message text not null default '',
  source text not null default 'direct',
  created_at timestamptz not null default now(),

  constraint contact_requests_name_length check (char_length(name) between 1 and 80),
  constraint contact_requests_email_format check (
    email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  constraint contact_requests_phone_format check (phone is null or phone ~ '^\+?[0-9 ().-]{6,30}$'),
  constraint contact_requests_reachable check (email is not null or phone is not null),
  constraint contact_requests_company_length check (char_length(company) <= 80),
  constraint contact_requests_message_length check (char_length(message) <= 500),
  constraint contact_requests_source check (source in ('direct', 'qr', 'share'))
);

create index contact_requests_profile_created_idx
  on public.contact_requests (profile_id, created_at desc);

alter table public.contact_requests enable row level security;

create policy "Owners can read their contact requests"
  on public.contact_requests for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "Owners can delete their contact requests"
  on public.contact_requests for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

-- Inserts happen server-side (secret key) through submit_contact_request().
revoke all on public.contact_requests from anon;
revoke insert, update, truncate, references, trigger on public.contact_requests from authenticated;

/**
 * Stores a request for a published card that accepts them. Returns the owner's
 * profile id (for the notification email) or null when the card doesn't take
 * requests. A card keeps at most 1000 requests: the oldest are dropped.
 */
create or replace function public.submit_contact_request(
  p_slug text,
  p_name text,
  p_email text,
  p_phone text,
  p_company text,
  p_message text,
  p_source text default 'direct'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select p.id into owner_id
  from public.profiles as p
  where p.slug = lower(p_slug)
    and p.is_published
    and p.accepts_contact_requests
    and p.full_name <> '';
  if owner_id is null then
    return null;
  end if;

  insert into public.contact_requests (profile_id, name, email, phone, company, message, source)
  values (owner_id, p_name, p_email, p_phone, coalesce(p_company, ''), coalesce(p_message, ''), coalesce(p_source, 'direct'));

  delete from public.contact_requests
  where id in (
    select c.id
    from public.contact_requests as c
    where c.profile_id = owner_id
    order by c.created_at desc
    offset 1000
  );

  return owner_id;
end;
$$;

revoke all on function public.submit_contact_request(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_contact_request(text, text, text, text, text, text, text) to service_role;

-- Retention: requests older than 24 months are deleted by the daily job too.
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

  return jsonb_build_object(
    'events', events, 'otp_attempts', attempts, 'rate_limits', buckets, 'slugs', slugs, 'contact_requests', contacts
  );
end;
$$;

revoke all on function public.cleanup_expired_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_data() to service_role;

-- Public read API: same contract as before plus the contact-form flag.
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
