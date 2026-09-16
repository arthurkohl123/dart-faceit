-- Wednesday Showdown is an event for the whole RankedDarts ecosystem:
-- confirmed ranked queue matches and confirmed ranked tournament matches count.
-- Private friend duels keep their match_mode = private and remain excluded.

update public.app_settings
set value = (value - 'included_tournament_ids') || jsonb_build_object(
  'description',
  'Vier Stunden, eine eigene Wochenwertung. Bestätigte Ranked-Matches aus der Queue und aus Turnieren zählen mit – deine Elo läuft ganz normal weiter.'
)
where key = 'wednesday_showdown';

create or replace function public.get_wednesday_showdown_leaderboard()
returns table (
  user_id uuid,
  username text,
  matches_played integer,
  wins integer,
  winrate numeric,
  average numeric,
  total_180s bigint,
  elo integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status record;
begin
  select * into v_status from public.get_wednesday_showdown_status();
  if not coalesce(v_status.is_active, false) then
    return;
  end if;

  return query
  with event_results as (
    select
      m.user_id,
      coalesce(p.username, 'Unbekannt') as player_username,
      p.elo as player_elo,
      count(distinct m.active_match_id)::integer as played,
      count(distinct m.active_match_id) filter (where m.is_win)::integer as won,
      round(avg(m.my_average)::numeric, 2) as player_average,
      coalesce(sum(m.one_eighties), 0)::bigint as player_180s
    from public.matches m
    join public.active_matches am on am.id = m.active_match_id
    join public.profiles p on p."supabaseId" = m.user_id::text
    where coalesce(m.match_mode, 'ranked') = 'ranked'
      and am.created_at >= v_status.starts_at
      and am.created_at < v_status.ends_at
      and coalesce(p.is_publicly_visible, true) = true
    group by m.user_id, p.username, p.elo
    having count(distinct m.active_match_id) >= v_status.minimum_matches
  )
  select
    event_results.user_id,
    event_results.player_username,
    event_results.played,
    event_results.won,
    round((event_results.won::numeric / nullif(event_results.played, 0)) * 100, 1),
    event_results.player_average,
    event_results.player_180s,
    event_results.player_elo
  from event_results
  order by
    event_results.won desc,
    (event_results.won::numeric / nullif(event_results.played, 0)) desc,
    event_results.player_average desc nulls last,
    event_results.played desc,
    event_results.player_username asc;
end;
$$;

create or replace function public.get_wednesday_showdown_recap()
returns table (
  period_start timestamptz,
  period_end timestamptz,
  user_id uuid,
  username text,
  matches_played integer,
  wins integer,
  winrate numeric,
  average numeric,
  total_180s bigint,
  elo integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status record;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  select * into v_status from public.get_wednesday_showdown_status();
  if not coalesce(v_status.event_enabled, false) then
    return;
  end if;

  v_period_start := v_status.starts_at - interval '7 days';
  v_period_end := v_status.ends_at - interval '7 days';

  return query
  with event_results as (
    select
      m.user_id,
      coalesce(p.username, 'Unbekannt') as player_username,
      p.elo as player_elo,
      count(distinct m.active_match_id)::integer as played,
      count(distinct m.active_match_id) filter (where m.is_win)::integer as won,
      round(avg(m.my_average)::numeric, 2) as player_average,
      coalesce(sum(m.one_eighties), 0)::bigint as player_180s
    from public.matches m
    join public.active_matches am on am.id = m.active_match_id
    join public.profiles p on p."supabaseId" = m.user_id::text
    where coalesce(m.match_mode, 'ranked') = 'ranked'
      and am.created_at >= v_period_start
      and am.created_at < v_period_end
      and coalesce(p.is_publicly_visible, true) = true
    group by m.user_id, p.username, p.elo
    having count(distinct m.active_match_id) >= v_status.minimum_matches
  )
  select
    v_period_start,
    v_period_end,
    event_results.user_id,
    event_results.player_username,
    event_results.played,
    event_results.won,
    round((event_results.won::numeric / nullif(event_results.played, 0)) * 100, 1),
    event_results.player_average,
    event_results.player_180s,
    event_results.player_elo
  from event_results
  order by
    event_results.won desc,
    (event_results.won::numeric / nullif(event_results.played, 0)) desc,
    event_results.player_average desc nulls last,
    event_results.played desc,
    event_results.player_username asc
  limit 3;
end;
$$;
