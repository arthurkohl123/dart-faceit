-- Exception for the current Academy Tour: normally the Wednesday Showdown is
-- queue-only, but this explicitly named tournament is meant to count today as
-- well. The allowlist remains stored in the Showdown setting so all other
-- tournaments stay excluded by default.

insert into public.app_settings (key, value)
select
  'wednesday_showdown',
  jsonb_build_object(
    'enabled', true,
    'free_limit_override', true,
    'title', 'Mittwoch Showdown',
    'weekday', 'wednesday',
    'starts_at_local', '18:00',
    'ends_at_local', '22:00',
    'minimum_matches', 3,
    'included_tournament_ids', jsonb_build_array(t.id::text)
  )
from public.tournaments t
where t.title = 'Academy Tour Event 1 - Saison 12'
on conflict (key) do update
set value = jsonb_set(
  public.app_settings.value,
  '{included_tournament_ids}',
  coalesce(
    (
      select jsonb_agg(distinct included.tournament_id)
      from (
        select jsonb_array_elements_text(
          coalesce(public.app_settings.value -> 'included_tournament_ids', '[]'::jsonb)
        ) as tournament_id
        union
        select t.id::text
        from public.tournaments t
        where t.title = 'Academy Tour Event 1 - Saison 12'
      ) included
    ),
    '[]'::jsonb
  ),
  true
);

-- One predicate for the current event and for its later recap. A match may be
-- included when it is not a tournament match at all, or when its tournament is
-- intentionally listed in the Showdown configuration.
create or replace function public.is_wednesday_showdown_eligible_match(p_active_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1
      from public.tournament_matches tm
      where tm.active_match_id = p_active_match_id
    )
    or exists (
      select 1
      from public.tournament_matches tm
      join public.app_settings setting on setting.key = 'wednesday_showdown'
      cross join lateral jsonb_array_elements_text(
        coalesce(setting.value -> 'included_tournament_ids', '[]'::jsonb)
      ) included(tournament_id)
      where tm.active_match_id = p_active_match_id
        and tm.tournament_id::text = included.tournament_id
    );
$$;

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
      and public.is_wednesday_showdown_eligible_match(am.id)
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
      and public.is_wednesday_showdown_eligible_match(am.id)
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

revoke all on function public.is_wednesday_showdown_eligible_match(uuid) from public;
revoke all on function public.get_wednesday_showdown_leaderboard() from public;
revoke all on function public.get_wednesday_showdown_recap() from public;
grant execute on function public.get_wednesday_showdown_leaderboard() to anon, authenticated;
grant execute on function public.get_wednesday_showdown_recap() to anon, authenticated;
