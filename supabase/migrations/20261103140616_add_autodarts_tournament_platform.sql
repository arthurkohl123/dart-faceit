-- AutoDarts is already a supported RankedDarts platform. Make it a first-class
-- tournament platform too, while keeping the creation and registration checks
-- entirely server-side.
begin;
set local lock_timeout = '5s';

alter table public.tournaments
  drop constraint if exists tournaments_scoring_platform_check;

alter table public.tournaments
  add constraint tournaments_scoring_platform_check
  check (scoring_platform in ('scolia', 'dartcounter', 'autodarts'));

create or replace function public.admin_create_tournament(
  p_title text, p_description text, p_starts_at timestamptz, p_registration_closes_at timestamptz,
  p_max_players integer, p_best_of integer, p_premium_only boolean, p_max_average numeric, p_min_average numeric,
  p_scoring_platform text default 'dartcounter', p_access_code text default null,
  p_tournament_format text default 'single_elimination', p_check_in_minutes integer default 30,
  p_prize_title text default null, p_prize_details text default null, p_dispute_policy text default null,
  p_dart_mode text default 'straight_in_double_out'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id uuid;
  v_code text := nullif(upper(trim(coalesce(p_access_code, ''))), '');
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_scoring_platform not in ('scolia', 'dartcounter', 'autodarts') then raise exception 'Ungültige Spielplattform.'; end if;
  if p_tournament_format not in ('single_elimination', 'double_elimination', 'group_stage') then raise exception 'Ungültiges Turnierformat.'; end if;
  if p_dart_mode not in ('straight_in_double_out', 'double_in_double_out') then raise exception 'Ungültiger Spielmodus.'; end if;
  if v_code is not null and char_length(v_code) < 4 then raise exception 'Ein Turniercode braucht mindestens 4 Zeichen.'; end if;

  insert into public.tournaments(
    title, description, starts_at, registration_closes_at, max_players, best_of, premium_only, max_average, min_average,
    scoring_platform, access_code_hash, created_by, tournament_format, dart_mode, check_in_opens_at, check_in_closes_at,
    prize_title, prize_details, dispute_policy, payout_deadline_days, payout_terms_version, payout_terms_snapshot
  )
  values(
    trim(p_title), trim(coalesce(p_description, '')), p_starts_at, p_registration_closes_at, p_max_players, p_best_of,
    coalesce(p_premium_only, false), p_max_average, p_min_average, p_scoring_platform,
    case when v_code is null then null else md5(v_code) end, auth.uid(), p_tournament_format, p_dart_mode,
    p_starts_at - make_interval(mins => greatest(5, p_check_in_minutes)), p_starts_at + interval '5 minutes',
    nullif(trim(p_prize_title), ''), nullif(trim(p_prize_details), ''),
    coalesce(nullif(trim(p_dispute_policy), ''), 'Bei Verbindungsproblemen sofort Screenshots sichern, den Gegner informieren und innerhalb von 15 Minuten ein Support-Ticket öffnen.'),
    90,
    '2026-10-18-90d',
    $current_terms$Ein angekündigtes Preisgeld wird spätestens innerhalb von 90 Kalendertagen nach endgültiger Feststellung der Platzierung und nach Eingang vollständiger und korrekter Zahlungsdaten ausgezahlt. Voraussetzung ist, dass keine offene Fair-Play- oder Identitätsprüfung besteht. Bei fehlenden oder fehlerhaften Daten beginnt die Frist nach deren Nachreichung erneut.$current_terms$
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_access_code text default null,
  p_accept_payout_terms boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_t public.tournaments%rowtype;
  v_profile record;
  v_average numeric;
  v_count integer;
  v_status text;
  v_position integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;

  select * into v_t
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' or now() > v_t.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  if v_t.access_code_hash is not null and md5(upper(trim(coalesce(p_access_code, '')))) <> v_t.access_code_hash then raise exception 'Der Turniercode ist ungültig.'; end if;
  if v_t.prize_title is not null and p_accept_payout_terms is not true then
    raise exception 'Bitte bestätige vor der Anmeldung die Auszahlungsfrist für dieses Turnier.';
  end if;
  if exists (
    select 1
    from public.tournament_participants
    where tournament_id = p_tournament_id
      and user_id = auth.uid()
      and status not in ('withdrawn', 'removed', 'disqualified')
  ) then raise exception 'Du bist bereits angemeldet.'; end if;

  select username, scolia_username, dartcounter_username, autodarts_username into v_profile
  from public.profiles
  where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_t.premium_only and not public.has_active_premium(auth.uid()) then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  if v_t.scoring_platform = 'scolia' and nullif(trim(coalesce(v_profile.scolia_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen Scolia-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'dartcounter' and nullif(trim(coalesce(v_profile.dartcounter_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen DartCounter-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'autodarts' and nullif(trim(coalesce(v_profile.autodarts_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen AutoDarts-Namen im Profil.'; end if;

  v_average := public.tournament_player_average(auth.uid());
  if v_t.max_average is not null and coalesce(v_average, 0) > v_t.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_t.min_average is not null and coalesce(v_average, 0) < v_t.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;

  select count(*) into v_count
  from public.tournament_participants
  where tournament_id = p_tournament_id
    and status in ('registered', 'checked_in');

  v_status := case when v_count >= v_t.max_players then 'waitlisted' else 'registered' end;
  if v_status = 'waitlisted' then
    select coalesce(max(waitlist_position), 0) + 1 into v_position
    from public.tournament_participants
    where tournament_id = p_tournament_id
      and status = 'waitlisted';
  end if;

  delete from public.tournament_participants
  where tournament_id = p_tournament_id
    and user_id = auth.uid()
    and status in ('withdrawn', 'removed', 'disqualified');

  insert into public.tournament_participants(tournament_id, user_id, username, average_snapshot, status, waitlist_position)
  values (p_tournament_id, auth.uid(), v_profile.username, v_average, v_status, v_position);

  if v_t.prize_title is not null then
    insert into public.tournament_rule_acceptances(
      tournament_id, user_id, rules_version, payout_deadline_days, terms_snapshot
    )
    values (
      v_t.id, auth.uid(), v_t.payout_terms_version, v_t.payout_deadline_days, v_t.payout_terms_snapshot
    )
    on conflict (tournament_id, user_id, rules_version) do nothing;
  end if;

  return v_status;
end;
$$;

revoke all on function public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text,text,integer,text,text,text,text) from public, anon;
grant execute on function public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text,text,integer,text,text,text,text) to authenticated;
revoke all on function public.join_tournament(uuid,text,boolean) from public, anon;
grant execute on function public.join_tournament(uuid,text,boolean) to authenticated;

commit;
