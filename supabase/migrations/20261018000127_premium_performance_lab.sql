-- Premium Performance-Labor
--
-- The report is deliberately generated in a self-scoped RPC.  Browser
-- clients never choose a player id, and the Premium gate is enforced here
-- as well as in the interface so a direct RPC call cannot unlock 30/90-day
-- data for a Free account.

create or replace function public.get_my_premium_performance(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested_days integer := coalesce(p_days, 7);
  v_period_days integer;
  v_is_premium boolean;
  v_now timestamptz := now();
  v_period_start timestamptz;
  v_previous_period_start timestamptz;
  v_summary jsonb;
  v_previous_summary jsonb;
  v_form jsonb;
  v_platforms jsonb;
  v_personal_bests jsonb;
  v_unassigned_matches integer;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if v_requested_days not in (7, 30, 90) then
    raise exception 'INVALID_PERFORMANCE_PERIOD';
  end if;

  v_is_premium := public.has_active_premium(v_user_id);
  v_period_days := case when v_is_premium then v_requested_days else 7 end;
  v_period_start := v_now - make_interval(days => v_period_days);
  v_previous_period_start := v_period_start - make_interval(days => v_period_days);

  select jsonb_build_object(
    'matches', count(*)::integer,
    'wins', count(*) filter (where match_history.is_win)::integer,
    'losses', count(*) filter (where not match_history.is_win)::integer,
    'win_rate', case when count(*) = 0 then null else round((100.0 * count(*) filter (where match_history.is_win)) / count(*), 1) end,
    'elo_delta', coalesce(sum(match_history.elo_change), 0)::integer,
    'average', round(avg(match_history.my_average), 1),
    'average_matches', count(match_history.my_average)::integer,
    'highest_checkout', max(nullif(match_history.highest_checkout, 0)),
    'one_eighties', coalesce(sum(match_history.one_eighties), 0)::integer
  ) into v_summary
  from public.matches match_history
  where match_history.user_id = v_user_id
    and match_history.status = 'completed'
    and match_history.match_mode = 'ranked'
    and match_history.completed_at >= v_period_start
    and match_history.completed_at < v_now;

  -- Free accounts intentionally receive only this compact, factual 7-day
  -- preview.  The detailed arrays and all-time records stay server-side.
  if not v_is_premium then
    return jsonb_build_object(
      'is_premium', false,
      'full_access', false,
      'requested_period_days', v_requested_days,
      'period_days', v_period_days,
      'period_start', v_period_start,
      'period_end', v_now,
      'summary', v_summary
    );
  end if;

  select jsonb_build_object(
    'matches', count(*)::integer,
    'wins', count(*) filter (where match_history.is_win)::integer,
    'losses', count(*) filter (where not match_history.is_win)::integer,
    'win_rate', case when count(*) = 0 then null else round((100.0 * count(*) filter (where match_history.is_win)) / count(*), 1) end,
    'elo_delta', coalesce(sum(match_history.elo_change), 0)::integer,
    'average', round(avg(match_history.my_average), 1),
    'average_matches', count(match_history.my_average)::integer,
    'highest_checkout', max(nullif(match_history.highest_checkout, 0)),
    'one_eighties', coalesce(sum(match_history.one_eighties), 0)::integer
  ) into v_previous_summary
  from public.matches match_history
  where match_history.user_id = v_user_id
    and match_history.status = 'completed'
    and match_history.match_mode = 'ranked'
    and match_history.completed_at >= v_previous_period_start
    and match_history.completed_at < v_period_start;

  with days as (
    select generate_series(
      (v_period_start at time zone 'Europe/Berlin')::date,
      (v_now at time zone 'Europe/Berlin')::date,
      interval '1 day'
    )::date as day
  ), daily as (
    select
      (match_history.completed_at at time zone 'Europe/Berlin')::date as day,
      count(*)::integer as matches,
      count(*) filter (where match_history.is_win)::integer as wins,
      round(avg(match_history.my_average), 1) as average,
      coalesce(sum(match_history.elo_change), 0)::integer as elo_delta
    from public.matches match_history
    where match_history.user_id = v_user_id
      and match_history.status = 'completed'
      and match_history.match_mode = 'ranked'
      and match_history.completed_at >= v_period_start
      and match_history.completed_at < v_now
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', days.day,
        'matches', coalesce(daily.matches, 0),
        'wins', coalesce(daily.wins, 0),
        'average', daily.average,
        'elo_delta', coalesce(daily.elo_delta, 0)
      ) order by days.day
    ),
    '[]'::jsonb
  ) into v_form
  from days
  left join daily on daily.day = days.day;

  with platforms(platform, position) as (
    values ('scolia'::text, 1), ('dartcounter'::text, 2), ('autodarts'::text, 3)
  ), platform_stats as (
    select
      coalesce(match_history.app, active_match.app) as platform,
      count(*)::integer as matches,
      count(*) filter (where match_history.is_win)::integer as wins,
      case when count(*) = 0 then null else round((100.0 * count(*) filter (where match_history.is_win)) / count(*), 1) end as win_rate,
      round(avg(match_history.my_average), 1) as average,
      coalesce(sum(match_history.elo_change), 0)::integer as elo_delta,
      coalesce(sum(match_history.one_eighties), 0)::integer as one_eighties
    from public.matches match_history
    left join public.active_matches active_match on active_match.id = match_history.active_match_id
    where match_history.user_id = v_user_id
      and match_history.status = 'completed'
      and match_history.match_mode = 'ranked'
      and match_history.completed_at >= v_period_start
      and match_history.completed_at < v_now
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'platform', platforms.platform,
        'matches', coalesce(platform_stats.matches, 0),
        'wins', coalesce(platform_stats.wins, 0),
        'win_rate', platform_stats.win_rate,
        'average', platform_stats.average,
        'elo_delta', coalesce(platform_stats.elo_delta, 0),
        'one_eighties', coalesce(platform_stats.one_eighties, 0)
      ) order by platforms.position
    ),
    '[]'::jsonb
  ) into v_platforms
  from platforms
  left join platform_stats on platform_stats.platform = platforms.platform;

  select count(*)::integer into v_unassigned_matches
  from public.matches match_history
  left join public.active_matches active_match on active_match.id = match_history.active_match_id
  where match_history.user_id = v_user_id
    and match_history.status = 'completed'
    and match_history.match_mode = 'ranked'
    and match_history.completed_at >= v_period_start
    and match_history.completed_at < v_now
    and coalesce(match_history.app, active_match.app) is null;

  select jsonb_build_object(
    'best_average', round(max(match_history.my_average), 1),
    'highest_checkout', max(nullif(match_history.highest_checkout, 0)),
    'most_180s_in_match', max(coalesce(match_history.one_eighties, 0)),
    'best_elo_gain', max(match_history.elo_change)
  ) into v_personal_bests
  from public.matches match_history
  where match_history.user_id = v_user_id
    and match_history.status = 'completed'
    and match_history.match_mode = 'ranked';

  return jsonb_build_object(
    'is_premium', true,
    'full_access', true,
    'requested_period_days', v_requested_days,
    'period_days', v_period_days,
    'period_start', v_period_start,
    'period_end', v_now,
    'summary', v_summary,
    'previous_summary', v_previous_summary,
    'form', v_form,
    'platforms', v_platforms,
    'unassigned_matches', v_unassigned_matches,
    'personal_bests', v_personal_bests
  );
end;
$$;

-- Repair rows whose platform can be proven from their completed active match.
-- Older rows without any linked platform remain explicitly unassigned in the
-- report instead of being guessed.
update public.matches match_history
set app = active_match.app
from public.active_matches active_match
where match_history.app is null
  and match_history.active_match_id = active_match.id
  and active_match.app is not null;

revoke all on function public.get_my_premium_performance(integer) from public, anon;
grant execute on function public.get_my_premium_performance(integer) to authenticated;

comment on function public.get_my_premium_performance(integer) is
  'Self-scoped Premium Performance-Labor: Free gets a 7-day summary; Premium gets 7/30/90-day insights.';
