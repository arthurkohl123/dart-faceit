-- Streamer can host free community cups without inheriting administrative
-- tournament, payout, moderation or result-management permissions.
begin;
set local lock_timeout = '5s';

alter table public.tournaments
  add column if not exists streamer_hosted boolean not null default false,
  add column if not exists creator_announcement_pending_at timestamptz,
  add column if not exists creator_announcement_sent_at timestamptz,
  add column if not exists creator_announcement_error text;

comment on column public.tournaments.streamer_hosted is
  'True only for no-prize community tournaments created through the Streamer Hub.';

create index if not exists tournaments_streamer_creator_active_idx
  on public.tournaments (created_by, starts_at desc)
  where streamer_hosted = true and status in ('registration', 'live');

-- Defence in depth: even an accidental privileged SQL call cannot turn a
-- streamer community event into a Premium- or prize tournament.
create or replace function public.enforce_streamer_hosted_tournament_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.streamer_hosted then
    if coalesce(new.premium_only, false)
      or nullif(trim(coalesce(new.prize_title, '')), '') is not null
      or nullif(trim(coalesce(new.prize_details, '')), '') is not null
      or new.access_code_hash is not null then
      raise exception 'Streamer-Turniere sind immer kostenlos, öffentlich und ohne Preisgeld.';
    end if;

    if not exists (
      select 1
      from public.profiles profile
      where profile."supabaseId" = new.created_by::text
        and coalesce(profile.is_streamer, false)
    ) then
      raise exception 'Nur aktive Streamer können Streamer-Turniere veranstalten.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_streamer_hosted_tournament_rules_trigger on public.tournaments;
create trigger enforce_streamer_hosted_tournament_rules_trigger
before insert or update of streamer_hosted, premium_only, prize_title, prize_details, access_code_hash, created_by
on public.tournaments
for each row execute function public.enforce_streamer_hosted_tournament_rules();

-- A host cannot join their own community event. Results still travel through
-- the normal player Matchroom flow and cannot be edited by a streamer.
create or replace function public.prevent_streamer_host_tournament_participation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.tournaments tournament
    where tournament.id = new.tournament_id
      and tournament.streamer_hosted = true
      and tournament.created_by = new.user_id
  ) then
    raise exception 'Als Veranstalter kannst du nicht selbst an deinem Streamer-Turnier teilnehmen.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_streamer_host_tournament_participation_trigger on public.tournament_participants;
create trigger prevent_streamer_host_tournament_participation_trigger
before insert or update of tournament_id, user_id on public.tournament_participants
for each row execute function public.prevent_streamer_host_tournament_participation();

drop function if exists public.list_tournaments();
create function public.list_tournaments()
returns table (
  id uuid, title text, description text, starts_at timestamptz, registration_closes_at timestamptz,
  max_players integer, best_of integer, premium_only boolean, max_average numeric, min_average numeric,
  status text, winner_id uuid, participant_count bigint, joined boolean, winner_username text,
  scoring_platform text, requires_access_code boolean, tournament_format text, dart_mode text,
  check_in_opens_at timestamptz, check_in_closes_at timestamptz, prize_title text, prize_details text,
  dispute_policy text, cancellation_reason text, waitlist_count bigint, participant_status text,
  checked_in boolean, checked_in_count bigint, payout_deadline_days smallint, payout_terms_version text,
  payout_terms_snapshot text, streamer_hosted boolean, host_username text, host_twitch_url text
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    tournament.id, tournament.title, tournament.description, tournament.starts_at, tournament.registration_closes_at,
    tournament.max_players, tournament.best_of, tournament.premium_only, tournament.max_average, tournament.min_average,
    tournament.status, tournament.winner_id,
    count(participant.id) filter (where participant.status in ('registered', 'checked_in')),
    coalesce(bool_or(participant.user_id = auth.uid() and participant.status not in ('withdrawn', 'removed', 'disqualified')), false),
    winner.username, tournament.scoring_platform, tournament.access_code_hash is not null, tournament.tournament_format, tournament.dart_mode,
    tournament.check_in_opens_at, tournament.check_in_closes_at, tournament.prize_title, tournament.prize_details,
    tournament.dispute_policy, tournament.cancellation_reason,
    count(participant.id) filter (where participant.status = 'waitlisted'),
    max(participant.status) filter (where participant.user_id = auth.uid()),
    coalesce(bool_or(participant.user_id = auth.uid() and participant.status = 'checked_in'), false),
    count(participant.id) filter (where participant.status = 'checked_in'),
    tournament.payout_deadline_days, tournament.payout_terms_version, tournament.payout_terms_snapshot,
    tournament.streamer_hosted,
    case when tournament.streamer_hosted then host.username else null end,
    case when tournament.streamer_hosted then host.twitch_url else null end
  from public.tournaments tournament
  left join public.tournament_participants participant on participant.tournament_id = tournament.id
  left join public.profiles winner on winner."supabaseId" = tournament.winner_id::text
  left join public.profiles host on host."supabaseId" = tournament.created_by::text
  where tournament.status <> 'draft'
  group by tournament.id, winner.username, host.username, host.twitch_url
  order by case tournament.status when 'registration' then 0 when 'live' then 1 when 'completed' then 2 else 3 end, tournament.starts_at asc;
$$;

-- Streamer Hub: a deliberately narrow creation endpoint. It can only create a
-- public, free cup and has both a simultaneous-event and rolling-week limit.
create or replace function public.streamer_create_tournament(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_registration_closes_at timestamptz,
  p_max_players integer,
  p_best_of integer,
  p_scoring_platform text,
  p_tournament_format text,
  p_dart_mode text default 'straight_in_double_out'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile."supabaseId" = auth.uid()::text
      and coalesce(profile.is_streamer, false)
  ) then
    raise exception 'STREAMER_ACCESS_REQUIRED';
  end if;

  if char_length(v_title) not between 3 and 80 then
    raise exception 'Der Turniertitel muss zwischen 3 und 80 Zeichen lang sein.';
  end if;
  if char_length(v_description) > 1_200 then
    raise exception 'Die Beschreibung darf höchstens 1.200 Zeichen lang sein.';
  end if;
  if p_max_players not in (4, 8, 16, 32) then
    raise exception 'Wähle 4, 8, 16 oder 32 Teilnehmer.';
  end if;
  if p_best_of not in (3, 5, 7, 9) then
    raise exception 'Wähle Best of 3, 5, 7 oder 9.';
  end if;
  if p_scoring_platform not in ('scolia', 'dartcounter', 'autodarts') then
    raise exception 'Ungültige Spielplattform.';
  end if;
  if p_tournament_format not in ('single_elimination', 'double_elimination', 'group_stage') then
    raise exception 'Ungültiges Turnierformat.';
  end if;
  if p_dart_mode not in ('straight_in_double_out', 'double_in_double_out') then
    raise exception 'Ungültiger Spielmodus.';
  end if;
  if p_starts_at is null or p_registration_closes_at is null
    or p_starts_at < now() + interval '60 minutes'
    or p_starts_at > now() + interval '30 days'
    or p_registration_closes_at < now() + interval '15 minutes'
    or p_registration_closes_at > p_starts_at - interval '20 minutes' then
    raise exception 'Plane den Start mindestens 60 Minuten im Voraus und schließe die Anmeldung spätestens 20 Minuten vorher.';
  end if;
  if exists (
    select 1
    from public.tournaments tournament
    where tournament.created_by = auth.uid()
      and tournament.streamer_hosted = true
      and tournament.status in ('registration', 'live')
  ) then
    raise exception 'Du kannst erst ein neues Turnier anlegen, wenn dein laufendes oder geplantes Community-Event beendet ist.';
  end if;
  if (
    select count(*)
    from public.tournaments tournament
    where tournament.created_by = auth.uid()
      and tournament.streamer_hosted = true
      and tournament.created_at >= now() - interval '7 days'
  ) >= 2 then
    raise exception 'Du kannst maximal zwei Community-Turniere innerhalb von sieben Tagen erstellen.';
  end if;

  insert into public.tournaments(
    title, description, starts_at, registration_closes_at, max_players, best_of,
    premium_only, max_average, min_average, scoring_platform, access_code_hash,
    created_by, tournament_format, dart_mode, check_in_opens_at, check_in_closes_at,
    prize_title, prize_details, dispute_policy, payout_deadline_days,
    payout_terms_version, payout_terms_snapshot, streamer_hosted
  ) values (
    v_title, v_description, p_starts_at, p_registration_closes_at, p_max_players, p_best_of,
    false, null, null, p_scoring_platform, null,
    auth.uid(), p_tournament_format, p_dart_mode, p_starts_at - interval '20 minutes', p_starts_at,
    null, null,
    'Bei Verbindungsproblemen sofort Screenshots sichern, den Gegner informieren und innerhalb von 15 Minuten ein Support-Ticket öffnen. Bis zur Klärung darf das Match nicht neu gestartet werden.',
    90,
    '2026-10-18-90d',
    $current_terms$Ein angekündigtes Preisgeld wird spätestens innerhalb von 90 Kalendertagen nach endgültiger Feststellung der Platzierung und nach Eingang vollständiger und korrekter Zahlungsdaten ausgezahlt. Voraussetzung ist, dass keine offene Fair-Play- oder Identitätsprüfung besteht. Bei fehlenden oder fehlerhaften Daten beginnt die Frist nach deren Nachreichung erneut.$current_terms$,
    true
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.streamer_list_my_tournaments()
returns table (
  id uuid, title text, description text, starts_at timestamptz, registration_closes_at timestamptz,
  check_in_opens_at timestamptz, check_in_closes_at timestamptz, max_players integer, best_of integer,
  status text, scoring_platform text, tournament_format text, dart_mode text,
  participant_count bigint, checked_in_count bigint, waitlist_count bigint,
  creator_announcement_sent_at timestamptz, creator_announcement_error text, created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles profile
    where profile."supabaseId" = auth.uid()::text and coalesce(profile.is_streamer, false)
  ) then
    raise exception 'STREAMER_ACCESS_REQUIRED';
  end if;

  return query
  select
    tournament.id, tournament.title, tournament.description, tournament.starts_at, tournament.registration_closes_at,
    tournament.check_in_opens_at, tournament.check_in_closes_at, tournament.max_players, tournament.best_of,
    tournament.status, tournament.scoring_platform, tournament.tournament_format, tournament.dart_mode,
    count(participant.id) filter (where participant.status in ('registered', 'checked_in')),
    count(participant.id) filter (where participant.status = 'checked_in'),
    count(participant.id) filter (where participant.status = 'waitlisted'),
    tournament.creator_announcement_sent_at, tournament.creator_announcement_error, tournament.created_at
  from public.tournaments tournament
  left join public.tournament_participants participant on participant.tournament_id = tournament.id
  where tournament.created_by = auth.uid()
    and tournament.streamer_hosted = true
  group by tournament.id
  order by case tournament.status when 'live' then 0 when 'registration' then 1 when 'completed' then 2 else 3 end, tournament.starts_at asc;
end;
$$;

create or replace function public.streamer_list_tournament_participants(p_tournament_id uuid)
returns table (
  username text, status text, checked_in_at timestamptz, average_snapshot numeric,
  joined_at timestamptz, waitlist_position integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.tournaments tournament
    join public.profiles profile on profile."supabaseId" = auth.uid()::text
    where tournament.id = p_tournament_id
      and tournament.created_by = auth.uid()
      and tournament.streamer_hosted = true
      and coalesce(profile.is_streamer, false)
  ) then
    raise exception 'STREAMER_TOURNAMENT_ACCESS_REQUIRED';
  end if;

  return query
  select participant.username, participant.status, participant.checked_in_at,
    participant.average_snapshot, participant.joined_at, participant.waitlist_position
  from public.tournament_participants participant
  where participant.tournament_id = p_tournament_id
    and participant.status not in ('withdrawn', 'removed', 'disqualified')
  order by case participant.status when 'checked_in' then 0 when 'registered' then 1 when 'waitlisted' then 2 else 3 end,
    participant.joined_at asc;
end;
$$;

create or replace function public.streamer_update_tournament_schedule(
  p_tournament_id uuid,
  p_registration_closes_at timestamptz,
  p_starts_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_title text;
begin
  if auth.uid() is null then raise exception 'STREAMER_ACCESS_REQUIRED'; end if;
  if p_starts_at is null or p_registration_closes_at is null
    or p_starts_at < now() + interval '60 minutes'
    or p_starts_at > now() + interval '30 days'
    or p_registration_closes_at < now() + interval '15 minutes'
    or p_registration_closes_at > p_starts_at - interval '20 minutes' then
    raise exception 'Plane den Start mindestens 60 Minuten im Voraus und schließe die Anmeldung spätestens 20 Minuten vorher.';
  end if;

  update public.tournaments tournament
  set registration_closes_at = p_registration_closes_at,
      check_in_opens_at = p_starts_at - interval '20 minutes',
      check_in_closes_at = p_starts_at,
      starts_at = p_starts_at,
      updated_at = now()
  where tournament.id = p_tournament_id
    and tournament.created_by = auth.uid()
    and tournament.streamer_hosted = true
    and tournament.status = 'registration'
    and exists (
      select 1 from public.profiles profile
      where profile."supabaseId" = auth.uid()::text and coalesce(profile.is_streamer, false)
    )
  returning tournament.title into v_title;

  if v_title is null then
    raise exception 'Du kannst nur dein eigenes Turnier während der Anmeldung zeitlich ändern.';
  end if;

  insert into public.notifications(user_id, type, title, body, href)
  select participant.user_id,
    'tournament_schedule_updated',
    'Turnierzeitplan aktualisiert',
    v_title || ': Anmeldung bis ' || to_char(p_registration_closes_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
      || ' Uhr · Check-in ab ' || to_char((p_starts_at - interval '20 minutes') at time zone 'Europe/Berlin', 'HH24:MI')
      || ' Uhr · Start ' || to_char(p_starts_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') || ' Uhr.',
    '/tournaments/' || p_tournament_id::text
  from public.tournament_participants participant
  where participant.tournament_id = p_tournament_id
    and participant.status in ('registered', 'checked_in', 'waitlisted');
end;
$$;

create or replace function public.streamer_cancel_tournament(
  p_tournament_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_title text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) not between 3 and 400 then
    raise exception 'Bitte nenne einen kurzen Grund für die Absage.';
  end if;

  update public.tournaments tournament
  set status = 'cancelled',
      cancellation_reason = v_reason,
      creator_announcement_pending_at = null,
      updated_at = now()
  where tournament.id = p_tournament_id
    and tournament.created_by = auth.uid()
    and tournament.streamer_hosted = true
    and tournament.status = 'registration'
    and exists (
      select 1 from public.profiles profile
      where profile."supabaseId" = auth.uid()::text and coalesce(profile.is_streamer, false)
    )
  returning tournament.title into v_title;

  if v_title is null then
    raise exception 'Du kannst nur dein eigenes Turnier vor dem Start absagen.';
  end if;

  insert into public.notifications(user_id, type, title, body, href)
  select participant.user_id,
    'tournament_cancelled',
    'Streamer-Turnier abgesagt',
    v_title || ': ' || v_reason,
    '/tournaments/' || p_tournament_id::text
  from public.tournament_participants participant
  where participant.tournament_id = p_tournament_id
    and participant.status not in ('withdrawn', 'removed', 'disqualified');
end;
$$;

revoke all on function public.list_tournaments() from public, anon;
-- The public tournament overview is intentionally available before login.
-- The creator management RPCs below remain authenticated-only.
grant execute on function public.list_tournaments() to anon;
grant execute on function public.list_tournaments() to authenticated;
revoke all on function public.streamer_create_tournament(text, text, timestamptz, timestamptz, integer, integer, text, text, text) from public, anon;
revoke all on function public.streamer_list_my_tournaments() from public, anon;
revoke all on function public.streamer_list_tournament_participants(uuid) from public, anon;
revoke all on function public.streamer_update_tournament_schedule(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.streamer_cancel_tournament(uuid, text) from public, anon;
grant execute on function public.streamer_create_tournament(text, text, timestamptz, timestamptz, integer, integer, text, text, text) to authenticated;
grant execute on function public.streamer_list_my_tournaments() to authenticated;
grant execute on function public.streamer_list_tournament_participants(uuid) to authenticated;
grant execute on function public.streamer_update_tournament_schedule(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.streamer_cancel_tournament(uuid, text) to authenticated;

commit;
