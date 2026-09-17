-- profiles.elo is smallint; the public Showdown RPC contracts expose integer.
-- Cast explicitly so qualified players are returned instead of the RPC failing.
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
  v_setting jsonb;
  v_makeup_date date;
  v_carryover_date date;
  v_start_time time;
  v_end_time time;
  v_carryover_start timestamptz;
  v_carryover_end timestamptz;
  v_include_carryover boolean := false;
begin
  select * into v_status from public.get_wednesday_showdown_status();
  if not coalesce(v_status.event_enabled, false) then return; end if;

  select value into v_setting from public.app_settings where key = 'wednesday_showdown';
  begin
    v_makeup_date := nullif(v_setting ->> 'makeup_date', '')::date;
    v_carryover_date := nullif(v_setting ->> 'makeup_carryover_date', '')::date;
    v_start_time := coalesce(nullif(v_setting ->> 'starts_at_local', '')::time, time '18:00');
    v_end_time := coalesce(nullif(v_setting ->> 'ends_at_local', '')::time, time '22:00');
  exception when others then
    v_makeup_date := null; v_carryover_date := null;
    v_start_time := time '18:00'; v_end_time := time '22:00';
  end;

  v_include_carryover := v_makeup_date is not null
    and v_carryover_date is not null
    and (v_status.starts_at at time zone 'Europe/Berlin')::date = v_makeup_date;
  if v_include_carryover then
    v_carryover_start := (v_carryover_date + v_start_time) at time zone 'Europe/Berlin';
    v_carryover_end := (v_carryover_date + v_end_time) at time zone 'Europe/Berlin';
  end if;

  return query
  with event_results as (
    select m.user_id, coalesce(p.username, 'Unbekannt') as player_username,
      p.elo::integer as player_elo,
      count(distinct m.active_match_id)::integer as played,
      count(distinct m.active_match_id) filter (where m.is_win)::integer as won,
      round(avg(m.my_average)::numeric, 2) as player_average,
      coalesce(sum(m.one_eighties), 0)::bigint as player_180s
    from public.matches m
    join public.profiles p on p."supabaseId" = m.user_id::text
    where coalesce(m.match_mode, 'ranked') = 'ranked'
      and m.active_match_id is not null
      and ((m.completed_at >= v_status.starts_at and m.completed_at < v_status.ends_at)
        or (v_include_carryover and m.completed_at >= v_carryover_start and m.completed_at < v_carryover_end))
      and coalesce(p.is_publicly_visible, true) = true
    group by m.user_id, p.username, p.elo
    having count(distinct m.active_match_id) >= v_status.minimum_matches
  )
  select event_results.user_id, event_results.player_username, event_results.played,
    event_results.won,
    round((event_results.won::numeric / nullif(event_results.played, 0)) * 100, 1),
    event_results.player_average, event_results.player_180s, event_results.player_elo
  from event_results
  order by event_results.won desc,
    (event_results.won::numeric / nullif(event_results.played, 0)) desc,
    event_results.player_average desc nulls last,
    event_results.played desc, event_results.player_username asc;
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
  v_status record; v_setting jsonb; v_period_start timestamptz; v_period_end timestamptz;
  v_makeup_date date; v_carryover_date date; v_start_time time; v_end_time time;
begin
  select * into v_status from public.get_wednesday_showdown_status();
  if not coalesce(v_status.event_enabled, false) then return; end if;
  select value into v_setting from public.app_settings where key = 'wednesday_showdown';
  begin
    v_makeup_date := nullif(v_setting ->> 'makeup_date', '')::date;
    v_carryover_date := nullif(v_setting ->> 'makeup_carryover_date', '')::date;
    v_start_time := coalesce(nullif(v_setting ->> 'starts_at_local', '')::time, time '18:00');
    v_end_time := coalesce(nullif(v_setting ->> 'ends_at_local', '')::time, time '22:00');
  exception when others then
    v_makeup_date := null; v_carryover_date := null;
    v_start_time := time '18:00'; v_end_time := time '22:00';
  end;

  if v_makeup_date is not null and v_carryover_date is not null
     and v_makeup_date >= ((v_status.starts_at at time zone 'Europe/Berlin')::date - 7)
     and v_makeup_date < (v_status.starts_at at time zone 'Europe/Berlin')::date then
    v_period_start := (v_carryover_date + v_start_time) at time zone 'Europe/Berlin';
    v_period_end := (v_makeup_date + v_end_time) at time zone 'Europe/Berlin';
  else
    v_period_start := v_status.starts_at - interval '7 days';
    v_period_end := v_status.ends_at - interval '7 days';
  end if;

  return query
  with event_results as (
    select m.user_id, coalesce(p.username, 'Unbekannt') as player_username,
      p.elo::integer as player_elo,
      count(distinct m.active_match_id)::integer as played,
      count(distinct m.active_match_id) filter (where m.is_win)::integer as won,
      round(avg(m.my_average)::numeric, 2) as player_average,
      coalesce(sum(m.one_eighties), 0)::bigint as player_180s
    from public.matches m
    join public.profiles p on p."supabaseId" = m.user_id::text
    where coalesce(m.match_mode, 'ranked') = 'ranked'
      and m.active_match_id is not null
      and m.completed_at >= v_period_start and m.completed_at < v_period_end
      and coalesce(p.is_publicly_visible, true) = true
    group by m.user_id, p.username, p.elo
    having count(distinct m.active_match_id) >= v_status.minimum_matches
  )
  select v_period_start, v_period_end, event_results.user_id, event_results.player_username,
    event_results.played, event_results.won,
    round((event_results.won::numeric / nullif(event_results.played, 0)) * 100, 1),
    event_results.player_average, event_results.player_180s, event_results.player_elo
  from event_results
  order by event_results.won desc,
    (event_results.won::numeric / nullif(event_results.played, 0)) desc,
    event_results.player_average desc nulls last,
    event_results.played desc, event_results.player_username asc
  limit 3;
end;
$$;
