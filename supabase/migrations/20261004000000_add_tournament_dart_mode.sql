-- Tournament game mode: keep the existing ranked/private match_mode separate.
-- The dart mode controls how each leg starts and finishes.

alter table public.tournaments
  add column if not exists dart_mode text not null default 'straight_in_double_out';

update public.tournaments
set dart_mode = 'straight_in_double_out'
where dart_mode is null or dart_mode not in ('straight_in_double_out', 'double_in_double_out');

alter table public.tournaments
  alter column dart_mode set default 'straight_in_double_out',
  alter column dart_mode set not null;

alter table public.tournaments
  drop constraint if exists tournaments_dart_mode_check;

alter table public.tournaments
  add constraint tournaments_dart_mode_check
  check (dart_mode in ('straight_in_double_out', 'double_in_double_out'));

alter table public.active_matches
  add column if not exists dart_mode text not null default 'straight_in_double_out';

update public.active_matches
set dart_mode = 'straight_in_double_out'
where dart_mode is null or dart_mode not in ('straight_in_double_out', 'double_in_double_out');

alter table public.active_matches
  alter column dart_mode set default 'straight_in_double_out',
  alter column dart_mode set not null;

alter table public.active_matches
  drop constraint if exists active_matches_dart_mode_check;

alter table public.active_matches
  add constraint active_matches_dart_mode_check
  check (dart_mode in ('straight_in_double_out', 'double_in_double_out'));

drop function if exists public.list_tournaments();
create function public.list_tournaments()
returns table (
  id uuid, title text, description text, starts_at timestamptz, registration_closes_at timestamptz,
  max_players integer, best_of integer, premium_only boolean, max_average numeric, min_average numeric,
  status text, winner_id uuid, participant_count bigint, joined boolean, winner_username text,
  scoring_platform text, requires_access_code boolean, tournament_format text, dart_mode text,
  check_in_opens_at timestamptz, check_in_closes_at timestamptz, prize_title text, prize_details text,
  dispute_policy text, cancellation_reason text, waitlist_count bigint, participant_status text,
  checked_in boolean, checked_in_count bigint
)
language sql security definer set search_path = public
as $$
  select t.id, t.title, t.description, t.starts_at, t.registration_closes_at, t.max_players, t.best_of,
    t.premium_only, t.max_average, t.min_average, t.status, t.winner_id,
    count(tp.id) filter (where tp.status in ('registered','checked_in')),
    coalesce(bool_or(tp.user_id = auth.uid() and tp.status not in ('withdrawn','removed','disqualified')), false),
    winner.username, t.scoring_platform, t.access_code_hash is not null, t.tournament_format, t.dart_mode,
    t.check_in_opens_at, t.check_in_closes_at, t.prize_title, t.prize_details,
    t.dispute_policy, t.cancellation_reason,
    count(tp.id) filter (where tp.status = 'waitlisted'),
    max(tp.status) filter (where tp.user_id = auth.uid()),
    coalesce(bool_or(tp.user_id = auth.uid() and tp.status = 'checked_in'), false),
    count(tp.id) filter (where tp.status = 'checked_in')
  from public.tournaments t
  left join public.tournament_participants tp on tp.tournament_id = t.id
  left join public.profiles winner on winner."supabaseId" = t.winner_id::text
  where t.status <> 'draft'
  group by t.id, winner.username
  order by case t.status when 'registration' then 0 when 'live' then 1 when 'completed' then 2 else 3 end, t.starts_at asc;
$$;

-- Replace both historical signatures so an older production schema cannot keep
-- resolving the RPC without the new mode argument.
drop function if exists public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text);
drop function if exists public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text,text,integer,text,text,text);
create function public.admin_create_tournament(
  p_title text,p_description text,p_starts_at timestamptz,p_registration_closes_at timestamptz,
  p_max_players integer,p_best_of integer,p_premium_only boolean,p_max_average numeric,p_min_average numeric,
  p_scoring_platform text default 'dartcounter',p_access_code text default null,
  p_tournament_format text default 'single_elimination',p_check_in_minutes integer default 30,
  p_prize_title text default null,p_prize_details text default null,p_dispute_policy text default null,
  p_dart_mode text default 'straight_in_double_out'
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text:=nullif(upper(trim(coalesce(p_access_code,''))), '');
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_scoring_platform not in ('scolia','dartcounter') then raise exception 'Ungültige Spielplattform.'; end if;
  if p_tournament_format not in ('single_elimination','double_elimination','group_stage') then raise exception 'Ungültiges Turnierformat.'; end if;
  if p_dart_mode not in ('straight_in_double_out','double_in_double_out') then raise exception 'Ungültiger Spielmodus.'; end if;
  if v_code is not null and char_length(v_code)<4 then raise exception 'Ein Turniercode braucht mindestens 4 Zeichen.'; end if;
  insert into public.tournaments(
    title,description,starts_at,registration_closes_at,max_players,best_of,premium_only,max_average,min_average,
    scoring_platform,access_code_hash,created_by,tournament_format,dart_mode,check_in_opens_at,check_in_closes_at,
    prize_title,prize_details,dispute_policy
  )
  values(
    trim(p_title),trim(coalesce(p_description,'')),p_starts_at,p_registration_closes_at,p_max_players,p_best_of,
    coalesce(p_premium_only,false),p_max_average,p_min_average,p_scoring_platform,
    case when v_code is null then null else md5(v_code) end,auth.uid(),p_tournament_format,p_dart_mode,
    p_starts_at-make_interval(mins=>greatest(5,p_check_in_minutes)),p_starts_at+interval '5 minutes',
    nullif(trim(p_prize_title),''),nullif(trim(p_prize_details),''),
    coalesce(nullif(trim(p_dispute_policy),''),'Bei Verbindungsproblemen sofort Screenshots sichern, den Gegner informieren und innerhalb von 15 Minuten ein Support-Ticket öffnen.')
  )
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
  v_active_match_id uuid; v_scoring_platform text; v_dart_mode text;
begin
  select * into v_match from public.tournament_matches where id = p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_match.active_match_id is not null then return v_match.active_match_id; end if;
  if v_match.player1_id is null or v_match.player2_id is null then raise exception 'Die Paarung ist noch nicht vollständig.'; end if;
  select username, coalesce(elo, 1000) into v_player1_name, v_player1_elo
    from public.profiles where "supabaseId" = v_match.player1_id::text;
  select username, coalesce(elo, 1000) into v_player2_name, v_player2_elo
    from public.profiles where "supabaseId" = v_match.player2_id::text;
  select scoring_platform, dart_mode into v_scoring_platform, v_dart_mode
    from public.tournaments where id = v_match.tournament_id;

  insert into public.active_matches(
    player1_id,player2_id,player1_username,player2_username,player1_elo,player2_elo,status,app,dart_mode
  )
  values(
    v_match.player1_id,v_match.player2_id,coalesce(v_player1_name,'Spieler 1'),coalesce(v_player2_name,'Spieler 2'),
    coalesce(v_player1_elo,1000),coalesce(v_player2_elo,1000),'pending_result',coalesce(v_scoring_platform,'dartcounter'),
    coalesce(v_dart_mode,'straight_in_double_out')
  )
  returning id into v_active_match_id;
  update public.tournament_matches set active_match_id = v_active_match_id, status = 'ready' where id = p_tournament_match_id;
  return v_active_match_id;
end;
$$;

drop function if exists public.list_player_tournament_history(uuid);
create function public.list_player_tournament_history(p_user_id uuid)
returns table(
  tournament_id uuid,title text,starts_at timestamptz,status text,tournament_format text,dart_mode text,
  scoring_platform text,participant_status text,wins integer,losses integer,points integer,placement integer,
  is_winner boolean,prize_title text
)
language sql security definer set search_path=public as $$
  select t.id,t.title,t.starts_at,t.status,t.tournament_format,t.dart_mode,t.scoring_platform,
    tp.status,tp.wins,tp.losses,tp.points,
    case when t.winner_id=p_user_id then 1 else null end,t.winner_id=p_user_id,t.prize_title
  from public.tournament_participants tp join public.tournaments t on t.id=tp.tournament_id
  where tp.user_id=p_user_id and t.status in ('live','completed','cancelled')
  order by t.starts_at desc limit 30;
$$;

grant execute on function public.list_tournaments() to authenticated;
grant execute on function public.create_tournament_matchroom(uuid) to authenticated;
grant execute on function public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text,text,integer,text,text,text,text) to authenticated;
grant execute on function public.list_player_tournament_history(uuid) to authenticated;
