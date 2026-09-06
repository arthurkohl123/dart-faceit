-- Profiles can be hidden from public discovery without affecting the owner's
-- personal profile, matchmaking, records, or the administrative dashboard.
alter table public.profiles
  add column if not exists is_publicly_visible boolean not null default true;

create index if not exists profiles_public_visibility_idx
  on public.profiles (is_publicly_visible)
  where is_publicly_visible = true;

-- This view is deliberately limited to the player-card fields used on public
-- pages.  Hidden profiles cannot be retrieved from it through the REST API.
create or replace view public.public_visible_profiles as
select
  p."supabaseId",
  p.username,
  p.elo,
  p."gamesPlayed",
  p.wins,
  p."isPremium"
from public.profiles p
where coalesce(p.is_publicly_visible, true) = true;

revoke all on table public.public_profiles from public, anon, authenticated;
revoke all on table public.public_visible_profiles from public;
grant select on table public.public_visible_profiles to anon, authenticated;

-- Aggregate and history RPCs must apply the same visibility rule; the owner
-- may still use them for their own /profile page after opting out publicly.
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
  join public.profiles p on p."supabaseId" = m.user_id::text
  where m.user_id = any(p_user_ids)
    and coalesce(m.match_mode, 'ranked') = 'ranked'
    and (
      coalesce(p.is_publicly_visible, true) = true
      or p."supabaseId" = auth.uid()::text
    )
  group by m.user_id;
$$;

create or replace function public.get_public_player_match_history(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  id text,
  created_at timestamptz,
  opponent_name text,
  is_win boolean,
  legs_won integer,
  legs_lost integer,
  my_average numeric,
  one_eighties integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id::text,
    m.created_at,
    coalesce(m.opponent_name, 'Unbekannter Gegner'),
    coalesce(m.is_win, false),
    coalesce(m.legs_won, 0),
    coalesce(m.legs_lost, 0),
    m.my_average::numeric,
    coalesce(m.one_eighties, 0)
  from public.matches m
  join public.profiles p on p."supabaseId" = m.user_id::text
  where m.user_id = p_user_id
    and coalesce(m.match_mode, 'ranked') = 'ranked'
    and (
      coalesce(p.is_publicly_visible, true) = true
      or p."supabaseId" = auth.uid()::text
    )
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

create or replace function public.list_player_tournament_history(p_user_id uuid)
returns table(
  tournament_id uuid,
  title text,
  starts_at timestamptz,
  status text,
  tournament_format text,
  scoring_platform text,
  participant_status text,
  wins integer,
  losses integer,
  points integer,
  placement integer,
  is_winner boolean,
  prize_title text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.title, t.starts_at, t.status, t.tournament_format, t.scoring_platform,
    tp.status, tp.wins, tp.losses, tp.points,
    case when t.winner_id = p_user_id then 1 else null end,
    t.winner_id = p_user_id,
    t.prize_title
  from public.tournament_participants tp
  join public.tournaments t on t.id = tp.tournament_id
  join public.profiles p on p."supabaseId" = tp.user_id::text
  where tp.user_id = p_user_id
    and t.status in ('live', 'completed', 'cancelled')
    and (
      coalesce(p.is_publicly_visible, true) = true
      or p."supabaseId" = auth.uid()::text
    )
  order by t.starts_at desc
  limit 30;
$$;

create or replace function public.get_public_admin_profile_ids()
returns table(profile_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select p."supabaseId"::text
  from public.profiles p
  where coalesce(p.is_admin, false) = true
    and coalesce(p.is_publicly_visible, true) = true
    and p."supabaseId" is not null;
$$;

-- Hide the requested internal/admin account. Its own /profile and the admin
-- dashboard continue to read the protected profiles table directly.
update public.profiles
set is_publicly_visible = false
where lower(username) = 'arthur';

grant execute on function public.get_public_player_statistics(uuid[]) to anon, authenticated;
grant execute on function public.get_public_player_match_history(uuid, integer) to anon, authenticated;
grant execute on function public.list_player_tournament_history(uuid) to authenticated;
grant execute on function public.get_public_admin_profile_ids() to anon, authenticated;
