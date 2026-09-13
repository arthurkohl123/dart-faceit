-- Wednesday Showdown: a weekly 18:00–22:00 (Europe/Berlin) ranked event.
-- Matches remain completely normal ranked matches: Elo and the season leaderboard
-- are updated through the existing finalisation path. This migration only adds
-- a time-scoped, computed event leaderboard and temporarily lifts Free quota.

insert into public.app_settings (key, value)
values (
  'wednesday_showdown',
  jsonb_build_object(
    'enabled', true,
    'free_limit_override', true,
    'title', 'Mittwoch Showdown',
    'weekday', 'wednesday',
    'starts_at_local', '18:00',
    'ends_at_local', '22:00',
    'minimum_matches', 3
  )
)
on conflict (key) do nothing;

-- Keep all timing calculations on the database server and explicitly use Berlin
-- time, so daylight saving changes do not move the event window.
create or replace function public.get_wednesday_showdown_status()
returns table (
  is_active boolean,
  event_enabled boolean,
  free_limit_override boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_matches integer,
  title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_setting jsonb;
  v_local_now timestamp := now() at time zone 'Europe/Berlin';
  v_event_date date;
  v_iso_day integer;
  v_start_local timestamp;
  v_end_local timestamp;
  v_enabled boolean;
  v_free_override boolean;
begin
  select value into v_setting
  from public.app_settings
  where key = 'wednesday_showdown';

  v_enabled := coalesce((v_setting ->> 'enabled')::boolean, true);
  v_free_override := coalesce((v_setting ->> 'free_limit_override')::boolean, true);
  v_iso_day := extract(isodow from v_local_now)::integer;
  v_event_date := v_local_now::date + ((3 - v_iso_day + 7) % 7);

  -- Once Wednesday's window has ended, status should point at next week.
  if v_iso_day = 3 and v_local_now::time >= time '22:00' then
    v_event_date := v_event_date + 7;
  end if;

  v_start_local := v_event_date + time '18:00';
  v_end_local := v_event_date + time '22:00';

  return query select
    v_enabled and v_local_now >= v_start_local and v_local_now < v_end_local,
    v_enabled,
    v_free_override,
    v_start_local at time zone 'Europe/Berlin',
    v_end_local at time zone 'Europe/Berlin',
    3,
    coalesce(nullif(v_setting ->> 'title', ''), 'Mittwoch Showdown');
end;
$$;

-- Only confirmed, normal queue matches whose matchroom was created during the
-- active window qualify. Tournament and private matches never enter this list.
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
      and not exists (
        select 1 from public.tournament_matches tm
        where tm.active_match_id = am.id
      )
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

-- The match card quota also reports the temporary unlimited status during an
-- active Showdown instead of misleading Free players with "4 / 4".
create or replace function public.get_ranked_match_daily_quota()
returns table(matches_used integer, daily_limit integer, is_premium boolean)
language sql
stable
security definer
set search_path = public
as $$
  with showdown as (
    select * from public.get_wednesday_showdown_status()
  )
  select
    coalesce(usage.matches_started, 0)::integer,
    case
      when public.has_active_premium(auth.uid())
        or (showdown.is_active and showdown.free_limit_override)
      then null
      else 4
    end,
    public.has_active_premium(auth.uid())
  from public.profiles profile
  left join public.daily_ranked_match_usage usage on usage.user_id = auth.uid()
    and usage.usage_date = (now() at time zone 'Europe/Berlin')::date
  cross join showdown
  where profile."supabaseId" = auth.uid()::text;
$$;

-- Existing trigger name and normal daily accounting are intentionally retained.
-- During the active Showdown only, a Free player's accepted ranked match does
-- not consume one of their four daily entries.
create or replace function public.enforce_free_daily_match_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_is_premium boolean;
  v_matches_started integer;
  v_usage_date date := (now() at time zone 'Europe/Berlin')::date;
  v_showdown record;
begin
  if coalesce(new.match_mode, 'ranked') <> 'ranked' then
    return new;
  end if;

  if not (old.status = 'pending_accept' and new.status = 'pending_result') then
    return new;
  end if;

  select * into v_showdown from public.get_wednesday_showdown_status();
  if coalesce(v_showdown.is_active, false) and coalesce(v_showdown.free_limit_override, false) then
    return new;
  end if;

  new.daily_quota_usage_date := v_usage_date;

  foreach v_player_id in array array[new.player1_id, new.player2_id] loop
    select public.has_active_premium(v_player_id)
    into v_is_premium;

    if not coalesce(v_is_premium, false) then
      insert into public.daily_ranked_match_usage as usage (user_id, usage_date, matches_started)
      values (v_player_id, v_usage_date, 1)
      on conflict (user_id, usage_date) do update
      set matches_started = usage.matches_started + 1
      where usage.matches_started < 4
      returning matches_started into v_matches_started;

      if not found then
        raise exception 'DAILY_MATCH_LIMIT: Free-Nutzer können maximal 4 Ranked Matches pro Tag starten.';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.get_wednesday_showdown_status() from public;
revoke all on function public.get_wednesday_showdown_leaderboard() from public;
grant execute on function public.get_wednesday_showdown_status() to anon, authenticated;
grant execute on function public.get_wednesday_showdown_leaderboard() to anon, authenticated;
grant execute on function public.get_ranked_match_daily_quota() to authenticated;
