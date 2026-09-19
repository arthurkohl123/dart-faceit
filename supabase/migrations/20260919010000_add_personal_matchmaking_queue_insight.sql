-- A privacy-preserving queue status for the active player. It only returns
-- aggregate counts and never exposes other players, their Elo, or platform
-- selections. The same active-row window and Elo limit as ranked matching
-- are used, so the UI cannot promise a different search result.

create or replace function public.get_my_matchmaking_queue_insight(
  p_apps text[],
  p_max_elo_diff integer
)
returns table(
  active_players bigint,
  compatible_players bigint,
  compatible_platforms bigint
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := (select auth.uid());
  v_apps text[];
  v_elo integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_max_elo_diff not between 25 and 500 then
    raise exception 'INVALID_ELO_RANGE';
  end if;

  select array_agg(distinct trim(value) order by trim(value))
  into v_apps
  from unnest(coalesce(p_apps, '{}'::text[])) as selected(value)
  where trim(value) in ('scolia', 'dartcounter', 'autodarts');

  if coalesce(cardinality(v_apps), 0) = 0 then
    raise exception 'INVALID_MATCHMAKING_PLATFORM';
  end if;

  select p.elo
  into v_elo
  from public.profiles p
  where p."supabaseId" = v_uid::text
    and coalesce(p.is_banned, false) = false;

  if not found then
    raise exception 'ACCOUNT_BANNED_OR_PROFILE_MISSING';
  end if;

  return query
  select
    count(distinct q.user_id)::bigint as active_players,
    count(distinct q.user_id) filter (where abs(q.elo - v_elo) <= p_max_elo_diff)::bigint as compatible_players,
    count(distinct q.app) filter (where abs(q.elo - v_elo) <= p_max_elo_diff)::bigint as compatible_platforms
  from public.matchmaking_queue q
  where q.user_id <> v_uid
    and q.app = any(v_apps)
    and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds';
end;
$$;

revoke all on function public.get_my_matchmaking_queue_insight(text[], integer) from public;
revoke all on function public.get_my_matchmaking_queue_insight(text[], integer) from anon;
grant execute on function public.get_my_matchmaking_queue_insight(text[], integer) to authenticated;
