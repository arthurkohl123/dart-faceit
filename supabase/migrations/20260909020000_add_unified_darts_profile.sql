-- Unified, platform-specific RankedDarts performance profile.
-- It deliberately reads only confirmed ranked history. Private friend matches
-- and platform usernames remain private and are never exposed by this RPC.

create or replace function public.get_public_player_platform_statistics(p_user_ids uuid[])
returns table (
  user_id uuid,
  app text,
  match_count bigint,
  wins bigint,
  average numeric,
  best_average numeric,
  total_180s bigint,
  last_played_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    m.app,
    count(*)::bigint as match_count,
    count(*) filter (where coalesce(m.is_win, false))::bigint as wins,
    round(avg(m.my_average)::numeric, 2) as average,
    round(max(m.my_average)::numeric, 2) as best_average,
    coalesce(sum(m.one_eighties), 0)::bigint as total_180s,
    max(coalesce(m.completed_at, m.created_at)) as last_played_at
  from public.matches m
  where m.user_id = any(p_user_ids)
    and m.app in ('scolia', 'dartcounter', 'autodarts')
    and coalesce(m.match_mode, 'ranked') = 'ranked'
  group by m.user_id, m.app;
$$;

revoke all on function public.get_public_player_platform_statistics(uuid[]) from public;
grant execute on function public.get_public_player_platform_statistics(uuid[]) to anon, authenticated;

comment on function public.get_public_player_platform_statistics(uuid[]) is
  'Public, platform-specific aggregates for confirmed RankedDarts matches only.';

-- Keep the existing overall profile performance consistent with the private-match
-- promise. Older rows had no match_mode and are treated as ranked by default.
create or replace function public.get_public_player_statistics(p_user_ids uuid[])
returns table (
  user_id uuid,
  average numeric,
  best_average numeric,
  total_180s bigint,
  match_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    round(avg(m.my_average)::numeric, 2) as average,
    round(max(m.my_average)::numeric, 2) as best_average,
    coalesce(sum(m.one_eighties), 0)::bigint as total_180s,
    count(*)::bigint as match_count
  from public.matches m
  where m.user_id = any(p_user_ids)
    and coalesce(m.match_mode, 'ranked') = 'ranked'
  group by m.user_id;
$$;

revoke all on function public.get_public_player_statistics(uuid[]) from public;
grant execute on function public.get_public_player_statistics(uuid[]) to anon, authenticated;
