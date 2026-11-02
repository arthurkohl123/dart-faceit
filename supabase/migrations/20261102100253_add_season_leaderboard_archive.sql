-- Keep a fixed record of each completed ladder. Current profiles continue to
-- hold all-time counters, while these snapshots preserve the exact final
-- leaderboard values for a past season.
create table if not exists public.season_leaderboard_snapshots (
  season_label text not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  supabase_id text not null,
  username text not null,
  elo integer not null check (elo >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= games_played),
  captured_at timestamptz not null default now(),
  primary key (season_label, profile_id)
);

create index if not exists season_leaderboard_snapshots_rank_idx
  on public.season_leaderboard_snapshots (season_label, elo desc, wins desc, username asc);

alter table public.season_leaderboard_snapshots enable row level security;
revoke all on table public.season_leaderboard_snapshots from public, anon, authenticated;

-- Season 01 ended immediately before the Season 02 reset. At this point the
-- all-time profile counters still equal the Season 01 counters because no
-- Season 02 result has been recorded yet. Elo is read from the reset ledger,
-- so it is the real pre-reset final rating.
insert into public.season_leaderboard_snapshots (
  season_label, profile_id, supabase_id, username, elo, games_played, wins, captured_at
)
select
  'Season 01',
  p.id,
  p."supabaseId",
  p.username,
  e.elo_before,
  coalesce(p."gamesPlayed", 0),
  coalesce(p.wins, 0),
  r.executed_at
from public.elo_season_resets r
join public.elo_season_reset_entries e on e.reset_id = r.id
join public.profiles p on p.id = e.profile_id
where lower(r.season_label) = 'season 02'
on conflict (season_label, profile_id) do nothing;

-- From now on each later reset snapshots the season which just ended before
-- changing Elo. Game and win totals are calculated from the locked, confirmed
-- ranked match history for that season.
create or replace function public.admin_execute_soft_elo_reset(
  p_season_label text,
  p_anchor_elo integer default 1000,
  p_compression_factor numeric default 0.500,
  p_confirmation text default null
)
returns table(
  reset_id uuid,
  player_count integer,
  changed_count integer,
  average_before numeric,
  average_after numeric,
  minimum_before integer,
  maximum_before integer,
  minimum_after integer,
  maximum_after integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_id uuid;
  v_admin_id text := auth.uid()::text;
  v_label text := nullif(trim(coalesce(p_season_label, '')), '');
  v_previous_season_label text;
  v_previous_season_started_at timestamptz;
  v_player_count integer;
  v_changed_count integer;
  v_average_before numeric;
  v_average_after numeric;
  v_minimum_before integer;
  v_maximum_before integer;
  v_minimum_after integer;
  v_maximum_after integer;
  v_queue_enabled boolean;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles
    where "supabaseId" = v_admin_id and coalesce(is_admin, false) = true
  ) then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  if p_confirmation is distinct from 'SOFT RESET' then
    raise exception 'Bestätigung für den Soft Reset fehlt.';
  end if;

  if v_label is null then
    raise exception 'Bitte eine Season-Bezeichnung angeben.';
  end if;

  if p_anchor_elo < 500 or p_anchor_elo > 2000 then
    raise exception 'Der Elo-Anker muss zwischen 500 und 2000 liegen.';
  end if;

  if p_compression_factor <= 0 or p_compression_factor > 1 then
    raise exception 'Der Kompressionsfaktor muss größer 0 und höchstens 1 sein.';
  end if;

  select coalesce((value ->> 'enabled')::boolean, true)
  into v_queue_enabled
  from public.app_settings
  where key = 'matchmaking_queue';

  if coalesce(v_queue_enabled, true) then
    raise exception 'Der Soft Reset ist nur bei geschlossener Ranked-Queue möglich.';
  end if;

  if exists (select 1 from public.matchmaking_queue) then
    raise exception 'Der Soft Reset ist gesperrt, solange Spieler in der Ranked-Queue warten.';
  end if;

  if exists (
    select 1 from public.active_matches
    where coalesce(status, '') not in ('completed', 'cancelled', 'expired')
  ) then
    raise exception 'Der Soft Reset ist gesperrt, solange Ranked-Matches laufen.';
  end if;

  lock table public.profiles in share row exclusive mode;

  if exists (
    select 1 from public.elo_season_resets
    where lower(season_label) = lower(v_label)
  ) then
    raise exception 'Für diese Season wurde bereits ein Reset angelegt.';
  end if;

  select season_label, executed_at
  into v_previous_season_label, v_previous_season_started_at
  from public.elo_season_resets
  where rolled_back_at is null
  order by executed_at desc
  limit 1;

  if v_previous_season_label is not null then
    insert into public.season_leaderboard_snapshots (
      season_label, profile_id, supabase_id, username, elo, games_played, wins, captured_at
    )
    select
      v_previous_season_label,
      p.id,
      p."supabaseId",
      p.username,
      coalesce(p.elo, p_anchor_elo),
      count(m.id)::integer,
      count(m.id) filter (where m.is_win)::integer,
      now()
    from public.profiles p
    left join public.matches m
      on m.user_id::text = p."supabaseId"
      and m.match_mode = 'ranked'
      and m.status = 'completed'
      and m.completed_at >= v_previous_season_started_at
    group by p.id, p."supabaseId", p.username, p.elo
    on conflict (season_label, profile_id) do nothing;
  end if;

  select
    count(*)::integer,
    round(avg(coalesce(elo, p_anchor_elo)), 2),
    min(coalesce(elo, p_anchor_elo))::integer,
    max(coalesce(elo, p_anchor_elo))::integer
  into v_player_count, v_average_before, v_minimum_before, v_maximum_before
  from public.profiles;

  insert into public.elo_season_resets (
    season_label, anchor_elo, compression_factor, player_count,
    average_before, minimum_before, maximum_before, executed_by
  ) values (
    v_label, p_anchor_elo, p_compression_factor, v_player_count,
    v_average_before, v_minimum_before, v_maximum_before, v_admin_id
  )
  returning id into v_reset_id;

  insert into public.elo_season_reset_entries (
    reset_id, profile_id, supabase_id, username, elo_before, elo_after
  )
  select
    v_reset_id,
    p.id,
    p."supabaseId",
    p.username,
    coalesce(p.elo, p_anchor_elo),
    round(p_anchor_elo + ((coalesce(p.elo, p_anchor_elo) - p_anchor_elo) * p_compression_factor))::integer
  from public.profiles p;

  update public.profiles p
  set elo = e.elo_after
  from public.elo_season_reset_entries e
  where e.reset_id = v_reset_id and e.profile_id = p.id;

  select
    (count(*) filter (where e.elo_before <> e.elo_after))::integer,
    round(avg(e.elo_after), 2),
    min(e.elo_after)::integer,
    max(e.elo_after)::integer
  into v_changed_count, v_average_after, v_minimum_after, v_maximum_after
  from public.elo_season_reset_entries e
  where e.reset_id = v_reset_id;

  update public.elo_season_resets
  set changed_count = v_changed_count,
      average_after = v_average_after,
      minimum_after = v_minimum_after,
      maximum_after = v_maximum_after
  where id = v_reset_id;

  return query select
    v_reset_id, v_player_count, v_changed_count,
    v_average_before, v_average_after,
    v_minimum_before, v_maximum_before,
    v_minimum_after, v_maximum_after;
end;
$$;

revoke all on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) from public;
grant execute on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) to authenticated;

create or replace function public.get_public_ranked_seasons()
returns table(
  season_label text,
  season_started_at timestamptz,
  season_ended_at timestamptz,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with ordered_seasons as (
    select
      r.season_label,
      r.executed_at as season_started_at,
      lead(r.executed_at) over (order by r.executed_at) as season_ended_at
    from public.elo_season_resets r
    where r.rolled_back_at is null
  )
  select
    s.season_label,
    s.season_started_at,
    s.season_ended_at,
    s.season_ended_at is null as is_current
  from ordered_seasons s
  where s.season_ended_at is null
    or exists (
      select 1
      from public.season_leaderboard_snapshots snapshot
      where snapshot.season_label = s.season_label
    )
  order by s.season_started_at desc;
$$;

revoke all on function public.get_public_ranked_seasons() from public, anon;
grant execute on function public.get_public_ranked_seasons() to anon, authenticated;

create or replace function public.get_public_season_leaderboard(
  p_season_label text,
  p_min_games integer default 10
)
returns table(
  username text,
  supabase_id text,
  elo integer,
  games_played integer,
  wins integer,
  is_premium boolean,
  premium_cosmetic text,
  is_streamer boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_label text := nullif(trim(coalesce(p_season_label, '')), '');
  v_started_at timestamptz;
  v_ended_at timestamptz;
begin
  if v_label is null then
    raise exception 'SEASON_LABEL_REQUIRED';
  end if;

  if p_min_games < 1 or p_min_games > 1000 then
    raise exception 'INVALID_MIN_GAMES';
  end if;

  select season_started_at, season_ended_at
  into v_started_at, v_ended_at
  from (
    select
      r.season_label,
      r.executed_at as season_started_at,
      lead(r.executed_at) over (order by r.executed_at) as season_ended_at
    from public.elo_season_resets r
    where r.rolled_back_at is null
  ) seasons
  where lower(seasons.season_label) = lower(v_label);

  if v_started_at is null then
    raise exception 'SEASON_NOT_FOUND';
  end if;

  if v_ended_at is null then
    return query
    select
      p.username,
      p."supabaseId",
      p.elo::integer,
      stats.games_played,
      stats.wins,
      coalesce(p."isPremium", false),
      p.premium_cosmetic::text,
      coalesce(p.is_streamer, false)
    from public.profiles p
    cross join lateral (
      select
        count(m.id)::integer as games_played,
        count(m.id) filter (where m.is_win)::integer as wins
      from public.matches m
      where m.user_id::text = p."supabaseId"
        and m.match_mode = 'ranked'
        and m.status = 'completed'
        and m.completed_at >= v_started_at
    ) stats
    where coalesce(p.is_publicly_visible, true) = true
      and stats.games_played >= p_min_games
    order by p.elo desc, stats.wins desc, p.username asc;
  else
    return query
    select
      snapshot.username,
      snapshot.supabase_id,
      snapshot.elo,
      snapshot.games_played,
      snapshot.wins,
      coalesce(p."isPremium", false),
      p.premium_cosmetic::text,
      coalesce(p.is_streamer, false)
    from public.season_leaderboard_snapshots snapshot
    join public.profiles p on p.id = snapshot.profile_id
    where lower(snapshot.season_label) = lower(v_label)
      and coalesce(p.is_publicly_visible, true) = true
      and snapshot.games_played >= p_min_games
    order by snapshot.elo desc, snapshot.wins desc, snapshot.username asc;
  end if;
end;
$$;

revoke all on function public.get_public_season_leaderboard(text, integer) from public, anon;
grant execute on function public.get_public_season_leaderboard(text, integer) to anon, authenticated;
