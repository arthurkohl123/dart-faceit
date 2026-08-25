-- Tournament operations: platform lock, invite codes and reliable no-show advancement.

alter table public.tournaments
  add column if not exists scoring_platform text not null default 'dartcounter'
    check (scoring_platform in ('scolia', 'dartcounter')),
  add column if not exists access_code_hash text;

-- Existing tournaments remain usable and default to DartCounter.
update public.tournaments set scoring_platform = 'dartcounter' where scoring_platform is null;

drop function if exists public.list_tournaments();
create function public.list_tournaments()
returns table (
  id uuid, title text, description text, starts_at timestamptz, registration_closes_at timestamptz,
  max_players integer, best_of integer, premium_only boolean, max_average numeric, min_average numeric,
  status text, winner_id uuid, participant_count bigint, joined boolean, winner_username text,
  scoring_platform text, requires_access_code boolean
)
language sql security definer set search_path = public
as $$
  select
    t.id, t.title, t.description, t.starts_at, t.registration_closes_at, t.max_players, t.best_of,
    t.premium_only, t.max_average, t.min_average, t.status, t.winner_id,
    count(tp.id) as participant_count,
    coalesce(bool_or(tp.user_id = auth.uid()), false) as joined,
    winner.username as winner_username,
    t.scoring_platform,
    t.access_code_hash is not null as requires_access_code
  from public.tournaments t
  left join public.tournament_participants tp on tp.tournament_id = t.id
  left join public.profiles winner on winner."supabaseId" = t.winner_id::text
  where t.status <> 'draft'
  group by t.id, winner.username
  order by case t.status when 'registration' then 0 when 'live' then 1 when 'completed' then 2 else 3 end, t.starts_at asc;
$$;

drop function if exists public.join_tournament(uuid);
create function public.join_tournament(p_tournament_id uuid, p_access_code text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_profile record;
  v_average numeric;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament.status <> 'registration' or now() > v_tournament.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  if v_tournament.access_code_hash is not null and md5(upper(trim(coalesce(p_access_code, '')))) <> v_tournament.access_code_hash then
    raise exception 'Der Turniercode ist ungültig.';
  end if;
  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id;
  if v_count >= v_tournament.max_players then raise exception 'Dieses Turnier ist bereits voll.'; end if;
  if exists (select 1 from public.tournament_participants where tournament_id = p_tournament_id and user_id = auth.uid()) then raise exception 'Du bist bereits angemeldet.'; end if;

  select username, coalesce("isPremium", false) as is_premium, scolia_username, dartcounter_username
    into v_profile from public.profiles where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_tournament.premium_only and not v_profile.is_premium then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  if v_tournament.scoring_platform = 'scolia' and nullif(trim(coalesce(v_profile.scolia_username, '')), '') is null then
    raise exception 'Für dieses Scolia-Turnier musst du zuerst deinen Scolia-Namen im Profil hinterlegen.';
  end if;
  if v_tournament.scoring_platform = 'dartcounter' and nullif(trim(coalesce(v_profile.dartcounter_username, '')), '') is null then
    raise exception 'Für dieses DartCounter-Turnier musst du zuerst deinen DartCounter-Namen im Profil hinterlegen.';
  end if;
  v_average := public.tournament_player_average(auth.uid());
  if v_tournament.max_average is not null and coalesce(v_average, 0) > v_tournament.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_tournament.min_average is not null and coalesce(v_average, 0) < v_tournament.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;

  insert into public.tournament_participants(tournament_id, user_id, username, average_snapshot)
  values (p_tournament_id, auth.uid(), v_profile.username, v_average);
end;
$$;

drop function if exists public.admin_create_tournament(text, text, timestamptz, timestamptz, integer, integer, boolean, numeric, numeric);
create function public.admin_create_tournament(
  p_title text, p_description text, p_starts_at timestamptz, p_registration_closes_at timestamptz,
  p_max_players integer, p_best_of integer, p_premium_only boolean, p_max_average numeric, p_min_average numeric,
  p_scoring_platform text default 'dartcounter', p_access_code text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_code text := nullif(upper(trim(coalesce(p_access_code, ''))), '');
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_scoring_platform not in ('scolia', 'dartcounter') then raise exception 'Ungültige Spielplattform.'; end if;
  if v_code is not null and char_length(v_code) < 4 then raise exception 'Ein Turniercode braucht mindestens 4 Zeichen.'; end if;
  insert into public.tournaments(title, description, starts_at, registration_closes_at, max_players, best_of, premium_only, max_average, min_average, scoring_platform, access_code_hash, created_by)
  values (trim(p_title), trim(coalesce(p_description, '')), p_starts_at, p_registration_closes_at, p_max_players, p_best_of, coalesce(p_premium_only, false), p_max_average, p_min_average, p_scoring_platform, case when v_code is null then null else md5(v_code) end, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_tournament_matchroom(p_tournament_match_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_player1_name text; v_player2_name text; v_player1_elo integer; v_player2_elo integer;
  v_active_match_id uuid; v_scoring_platform text;
begin
  select * into v_match from public.tournament_matches where id = p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_match.active_match_id is not null then return v_match.active_match_id; end if;
  if v_match.player1_id is null or v_match.player2_id is null then raise exception 'Die Paarung ist noch nicht vollständig.'; end if;
  select username, coalesce(elo, 1000) into v_player1_name, v_player1_elo from public.profiles where "supabaseId" = v_match.player1_id::text;
  select username, coalesce(elo, 1000) into v_player2_name, v_player2_elo from public.profiles where "supabaseId" = v_match.player2_id::text;
  select scoring_platform into v_scoring_platform from public.tournaments where id = v_match.tournament_id;

  insert into public.active_matches(player1_id, player2_id, player1_username, player2_username, player1_elo, player2_elo, status, app)
  values (v_match.player1_id, v_match.player2_id, coalesce(v_player1_name, 'Spieler 1'), coalesce(v_player2_name, 'Spieler 2'), coalesce(v_player1_elo, 1000), coalesce(v_player2_elo, 1000), 'pending_result', coalesce(v_scoring_platform, 'dartcounter'))
  returning id into v_active_match_id;
  update public.tournament_matches set active_match_id = v_active_match_id, status = 'ready' where id = p_tournament_match_id;
  return v_active_match_id;
end;
$$;

-- A validated no-show awards the tournament match to the player who reported it,
-- so the bracket cannot get stuck on a cancelled room.
create or replace function public.sync_tournament_matchroom_result()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_tournament_match_id uuid; v_winner_id uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.submitted_winner_id is not null then
    select id into v_tournament_match_id from public.tournament_matches where active_match_id = new.id;
    if v_tournament_match_id is not null then perform public.advance_tournament_bracket(v_tournament_match_id, new.submitted_winner_id); end if;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and coalesce(new.no_show_resolved, false) then
    select id into v_tournament_match_id from public.tournament_matches where active_match_id = new.id;
    v_winner_id := new.no_show_reported_by;
    if v_tournament_match_id is not null and v_winner_id is not null then perform public.advance_tournament_bracket(v_tournament_match_id, v_winner_id); end if;
  end if;
  return new;
end;
$$;

grant execute on function public.list_tournaments() to authenticated;
grant execute on function public.join_tournament(uuid, text) to authenticated;
grant execute on function public.admin_create_tournament(text, text, timestamptz, timestamptz, integer, integer, boolean, numeric, numeric, text, text) to authenticated;
