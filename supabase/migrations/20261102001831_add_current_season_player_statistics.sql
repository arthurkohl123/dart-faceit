-- Season stats are derived from confirmed ranked match history. The profile
-- counters remain the all-time totals; the latest non-rolled-back Elo reset
-- defines where the current season begins.
--
-- This means a Season 2 player starts with 0 / 0 immediately after its reset,
-- without throwing away their historical profile statistics.

create index if not exists matches_ranked_completed_season_stats_idx
  on public.matches (completed_at desc, user_id)
  where match_mode = 'ranked' and status = 'completed';

create or replace view public.public_visible_profiles as
with current_season as (
  select season_label, executed_at
  from public.elo_season_resets
  where rolled_back_at is null
  order by executed_at desc
  limit 1
),
seasonal_stats as (
  select
    m.user_id,
    count(*)::integer as season_games_played,
    count(*) filter (where m.is_win)::integer as season_wins
  from public.matches m
  cross join current_season cs
  where m.match_mode = 'ranked'
    and m.status = 'completed'
    and m.completed_at >= cs.executed_at
  group by m.user_id
)
select
  p."supabaseId",
  p.username,
  p.elo,
  p."gamesPlayed",
  p.wins,
  p."isPremium",
  p.premium_cosmetic,
  p.is_streamer,
  case when coalesce(p.is_streamer, false) then p.twitch_url else null end as twitch_url,
  case when coalesce(p.is_streamer, false) then p.kick_url else null end as kick_url,
  coalesce(cs.season_label, '—') as current_season_label,
  coalesce(stats.season_games_played, 0)::integer as season_games_played,
  coalesce(stats.season_wins, 0)::integer as season_wins
from public.profiles p
left join current_season cs on true
left join seasonal_stats stats on stats.user_id::text = p."supabaseId"
where coalesce(p.is_publicly_visible, true) = true;

revoke all on table public.public_visible_profiles from public, anon, authenticated;
grant select on table public.public_visible_profiles to anon, authenticated;

create or replace function public.get_my_current_season_stats()
returns table(
  season_label text,
  games_played integer,
  wins integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_season_label text;
  v_season_started_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select r.season_label, r.executed_at
  into v_season_label, v_season_started_at
  from public.elo_season_resets r
  where r.rolled_back_at is null
  order by r.executed_at desc
  limit 1;

  return query
  select
    coalesce(v_season_label, '—'),
    count(*) filter (
      where v_season_started_at is not null
        and m.match_mode = 'ranked'
        and m.status = 'completed'
        and m.completed_at >= v_season_started_at
    )::integer,
    count(*) filter (
      where v_season_started_at is not null
        and m.match_mode = 'ranked'
        and m.status = 'completed'
        and m.completed_at >= v_season_started_at
        and m.is_win
    )::integer
  from public.matches m
  where m.user_id = v_user_id;
end;
$$;

revoke all on function public.get_my_current_season_stats() from public, anon;
grant execute on function public.get_my_current_season_stats() to authenticated;
