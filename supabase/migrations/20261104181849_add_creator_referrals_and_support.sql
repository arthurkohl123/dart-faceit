-- Creator Hub extension: privacy-conscious referral attribution and a
-- distinct support lane for confirmed Streamers. No browser, IP or click
-- analytics are collected for referral links.
begin;
set local lock_timeout = '5s';

create table if not exists public.creator_referral_codes (
  streamer_profile_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint creator_referral_codes_format_check check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.creator_referral_attributions (
  referred_profile_id uuid primary key references public.profiles(id) on delete cascade,
  streamer_profile_id uuid not null references public.profiles(id) on delete restrict,
  referral_code text not null,
  registered_at timestamptz not null default now(),
  first_ranked_match_at timestamptz,
  constraint creator_referral_attributions_no_self_referral check (referred_profile_id <> streamer_profile_id)
);

create index if not exists creator_referral_attributions_streamer_registered_idx
  on public.creator_referral_attributions(streamer_profile_id, registered_at desc);
create index if not exists creator_referral_attributions_streamer_activated_idx
  on public.creator_referral_attributions(streamer_profile_id, first_ranked_match_at desc)
  where first_ranked_match_at is not null;

alter table public.creator_referral_codes enable row level security;
alter table public.creator_referral_attributions enable row level security;
revoke all on table public.creator_referral_codes from public, anon, authenticated;
revoke all on table public.creator_referral_attributions from public, anon, authenticated;
grant all on table public.creator_referral_codes to service_role;
grant all on table public.creator_referral_attributions to service_role;

create or replace function public.creator_referral_code_for_profile(p_username text, p_profile_id uuid)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select left(
    coalesce(nullif(regexp_replace(lower(trim(coalesce(p_username, ''))), '[^a-z0-9]+', '', 'g'), ''), 'creator'),
    24
  ) || '-' || left(replace(p_profile_id::text, '-', ''), 6);
$$;

-- A referral URL stays stable even if the Streamer later changes their name.
create or replace function public.ensure_creator_referral_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(new.is_streamer, false) then
    insert into public.creator_referral_codes(streamer_profile_id, code)
    values (new.id, public.creator_referral_code_for_profile(new.username, new.id))
    on conflict (streamer_profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_creator_referral_code_trigger on public.profiles;
create trigger ensure_creator_referral_code_trigger
after insert or update of is_streamer on public.profiles
for each row execute function public.ensure_creator_referral_code();

insert into public.creator_referral_codes(streamer_profile_id, code)
select profile.id, public.creator_referral_code_for_profile(profile.username, profile.id)
from public.profiles profile
where coalesce(profile.is_streamer, false)
on conflict (streamer_profile_id) do nothing;

-- The referral code is stored at sign-up and consumed only once when the
-- account profile is first created. A user can never rewrite attribution.
create or replace function public.capture_creator_referral_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_code text;
  v_streamer_profile_id uuid;
begin
  select lower(nullif(trim(user_row.raw_user_meta_data ->> 'creator_referral_code'), ''))
    into v_code
  from auth.users user_row
  where user_row.id::text = new."supabaseId";

  if v_code is null or char_length(v_code) > 64 then
    return new;
  end if;

  select referral.streamer_profile_id
    into v_streamer_profile_id
  from public.creator_referral_codes referral
  join public.profiles streamer on streamer.id = referral.streamer_profile_id
  where referral.code = v_code
    and coalesce(streamer.is_streamer, false)
  limit 1;

  if v_streamer_profile_id is null or v_streamer_profile_id = new.id then
    return new;
  end if;

  insert into public.creator_referral_attributions(
    referred_profile_id, streamer_profile_id, referral_code
  ) values (
    new.id, v_streamer_profile_id, v_code
  ) on conflict (referred_profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists capture_creator_referral_on_profile_insert_trigger on public.profiles;
create trigger capture_creator_referral_on_profile_insert_trigger
after insert on public.profiles
for each row execute function public.capture_creator_referral_on_profile_insert();

-- A conversion means the referred player completed their first ordinary
-- Ranked queue match. Tournament and private matches intentionally do not count.
create or replace function public.mark_creator_referral_first_ranked_match()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status <> 'completed'
    or (tg_op = 'UPDATE' and old.status = 'completed')
    or coalesce(new.match_mode, 'ranked') <> 'ranked'
    or exists (select 1 from public.tournament_matches tournament_match where tournament_match.active_match_id = new.id) then
    return new;
  end if;

  update public.creator_referral_attributions attribution
  set first_ranked_match_at = coalesce(new.completed_at, now())
  where attribution.first_ranked_match_at is null
    and attribution.referred_profile_id in (
      select profile.id
      from public.profiles profile
      where profile."supabaseId" = new.player1_id::text
         or profile."supabaseId" = new.player2_id::text
    );

  return new;
end;
$$;

drop trigger if exists mark_creator_referral_first_ranked_match_trigger on public.active_matches;
create trigger mark_creator_referral_first_ranked_match_trigger
after insert or update of status on public.active_matches
for each row execute function public.mark_creator_referral_first_ranked_match();

alter table public.support_tickets
  add column if not exists creator_support boolean not null default false;

create index if not exists support_tickets_creator_support_inbox_idx
  on public.support_tickets(priority, updated_at desc)
  where creator_support = true and status not in ('resolved', 'closed');

create or replace function public.streamer_get_referral_stats()
returns table(
  referral_code text,
  registrations bigint,
  first_ranked_matches bigint,
  latest_registration_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_username text;
begin
  select profile.id, profile.username
    into v_profile_id, v_username
  from public.profiles profile
  where profile."supabaseId" = auth.uid()::text
    and coalesce(profile.is_streamer, false);

  if v_profile_id is null then
    raise exception 'STREAMER_ACCESS_REQUIRED';
  end if;

  insert into public.creator_referral_codes(streamer_profile_id, code)
  values (v_profile_id, public.creator_referral_code_for_profile(v_username, v_profile_id))
  on conflict (streamer_profile_id) do nothing;

  return query
  select
    referral.code,
    count(attribution.referred_profile_id)::bigint,
    count(attribution.referred_profile_id) filter (where attribution.first_ranked_match_at is not null)::bigint,
    max(attribution.registered_at)
  from public.creator_referral_codes referral
  left join public.creator_referral_attributions attribution
    on attribution.streamer_profile_id = referral.streamer_profile_id
  where referral.streamer_profile_id = v_profile_id
  group by referral.code;
end;
$$;

create or replace function public.streamer_list_creator_support_tickets()
returns table(
  id uuid,
  subject text,
  status text,
  priority text,
  created_at timestamptz,
  updated_at timestamptz,
  message_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles profile
    where profile."supabaseId" = auth.uid()::text
      and coalesce(profile.is_streamer, false)
  ) then
    raise exception 'STREAMER_ACCESS_REQUIRED';
  end if;

  return query
  select
    ticket.id,
    regexp_replace(ticket.subject, E'^\\[Creator\\]\\s*', ''),
    ticket.status,
    ticket.priority,
    ticket.created_at,
    ticket.updated_at,
    count(message.id)::bigint
  from public.support_tickets ticket
  left join public.ticket_messages message on message.ticket_id = ticket.id
  where ticket.user_id = auth.uid()
    and ticket.creator_support = true
  group by ticket.id
  order by ticket.updated_at desc
  limit 12;
end;
$$;

create or replace function public.streamer_create_creator_support_ticket(
  p_subject text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_username text;
  v_subject text := trim(coalesce(p_subject, ''));
  v_message text := trim(coalesce(p_message, ''));
  v_ticket_id uuid;
begin
  select profile.username into v_username
  from public.profiles profile
  where profile."supabaseId" = auth.uid()::text
    and coalesce(profile.is_streamer, false);

  if v_username is null then
    raise exception 'STREAMER_ACCESS_REQUIRED';
  end if;
  if char_length(v_subject) not between 3 and 120 then
    raise exception 'Bitte gib einen Betreff mit 3 bis 120 Zeichen ein.';
  end if;
  if char_length(v_message) not between 10 and 4000 then
    raise exception 'Bitte beschreibe dein Anliegen mit 10 bis 4.000 Zeichen.';
  end if;
  if (
    select count(*)
    from public.support_tickets ticket
    where ticket.user_id = auth.uid()
      and ticket.creator_support = true
      and ticket.created_at >= now() - interval '24 hours'
  ) >= 3 then
    raise exception 'Du hast heute bereits drei Creator-Anfragen erstellt. Bitte warte auf eine Antwort.';
  end if;

  insert into public.support_tickets(
    user_id, username, subject, category, status, priority, creator_support
  ) values (
    auth.uid(), v_username, '[Creator] ' || v_subject, 'general', 'open', 'high', true
  ) returning id into v_ticket_id;

  insert into public.ticket_messages(ticket_id, sender_id, sender_name, is_staff, content)
  values (v_ticket_id, auth.uid(), v_username, false, v_message);

  return v_ticket_id;
end;
$$;

revoke all on function public.creator_referral_code_for_profile(text, uuid) from public, anon, authenticated;
revoke all on function public.ensure_creator_referral_code() from public, anon, authenticated;
revoke all on function public.capture_creator_referral_on_profile_insert() from public, anon, authenticated;
revoke all on function public.mark_creator_referral_first_ranked_match() from public, anon, authenticated;
revoke all on function public.streamer_get_referral_stats() from public, anon;
revoke all on function public.streamer_list_creator_support_tickets() from public, anon;
revoke all on function public.streamer_create_creator_support_ticket(text, text) from public, anon;
grant execute on function public.streamer_get_referral_stats() to authenticated;
grant execute on function public.streamer_list_creator_support_tickets() to authenticated;
grant execute on function public.streamer_create_creator_support_ticket(text, text) to authenticated;

commit;
