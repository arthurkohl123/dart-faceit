-- Season 01 is a finished, immutable ladder. The veteran title is therefore
-- awarded once from its final snapshot and can never be earned through later
-- matches or removed by a subsequent season reset.
alter table public.profiles
  add column if not exists is_season_one_veteran boolean not null default false,
  add column if not exists veteran_season_one_games integer not null default 0,
  add column if not exists veteran_granted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_veteran_season_one_games_check;
alter table public.profiles
  add constraint profiles_veteran_season_one_games_check
  check (veteran_season_one_games >= 0);

comment on column public.profiles.is_season_one_veteran is
  'Permanent cosmetic Veteran title for players with at least 150 confirmed Season 01 Ranked matches.';
comment on column public.profiles.veteran_season_one_games is
  'Immutable Season 01 Ranked-match count captured when the Veteran title was awarded.';

-- Do not allow a self-created profile to forge the historic title. The main
-- self-registration guard is maintained in earlier migrations; this additive
-- trigger also protects this later-added entitlement without affecting trusted
-- service-role provisioning.
create or replace function public.guard_veteran_profile_self_insert()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    new.is_season_one_veteran := false;
    new.veteran_season_one_games := 0;
    new.veteran_granted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_guard_veteran_profile_self_insert on public.profiles;
create trigger zz_guard_veteran_profile_self_insert
before insert on public.profiles
for each row
execute function public.guard_veteran_profile_self_insert();

-- There are no estimates here: eligibility comes from the frozen Season 01
-- leaderboard snapshot, not from all-time counters after Season 02 started.
update public.profiles profile
set
  is_season_one_veteran = true,
  veteran_season_one_games = snapshot.games_played,
  veteran_granted_at = coalesce(profile.veteran_granted_at, now())
from public.season_leaderboard_snapshots snapshot
where snapshot.profile_id = profile.id
  and lower(snapshot.season_label) = 'season 01'
  and snapshot.games_played >= 150;

-- The public profile projection deliberately exposes only the cosmetic title
-- and the historic game count, never staff or billing data.
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
  coalesce(stats.season_wins, 0)::integer as season_wins,
  p.is_season_one_veteran,
  p.veteran_season_one_games
from public.profiles p
left join current_season cs on true
left join seasonal_stats stats on stats.user_id::text = p."supabaseId"
where coalesce(p.is_publicly_visible, true) = true;

revoke all on table public.public_visible_profiles from public, anon, authenticated;
grant select on table public.public_visible_profiles to anon, authenticated;

-- Extend the existing public leaderboard contract with the cosmetic flag.
-- PostgreSQL requires a drop/recreate when the OUT-column list changes; this
-- RPC has no database dependants and the client keeps the same call signature.
drop function if exists public.get_public_season_leaderboard(text, integer);

create function public.get_public_season_leaderboard(
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
  is_streamer boolean,
  is_season_one_veteran boolean
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
      coalesce(p.is_streamer, false),
      coalesce(p.is_season_one_veteran, false)
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
      coalesce(p.is_streamer, false),
      coalesce(p.is_season_one_veteran, false)
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

notify pgrst, 'reload schema';
