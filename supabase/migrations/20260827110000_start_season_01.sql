-- Start Season 01 with a clean competitive ladder while retaining Beta data.
-- The existing matches table remains untouched, so the complete career history
-- and all-time match details stay available to players and administrators.

create table if not exists public.season_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_label text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  supabase_id text not null,
  username text,
  elo integer not null default 1000,
  games_played integer not null default 0,
  wins integer not null default 0,
  captured_at timestamptz not null default now(),
  unique (season_label, profile_id)
);

create index if not exists season_profile_snapshots_user_idx
  on public.season_profile_snapshots(supabase_id, captured_at desc);

alter table public.season_profile_snapshots enable row level security;
revoke all on public.season_profile_snapshots from anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.active_matches
    where status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then
    raise exception 'SEASON_RESET_BLOCKED_ACTIVE_MATCHES';
  end if;

  -- Archive each player's pre-Season-01 profile state exactly once.
  insert into public.season_profile_snapshots (
    season_label, profile_id, supabase_id, username, elo, games_played, wins
  )
  select
    'Beta',
    p.id,
    p."supabaseId",
    p.username,
    coalesce(p.elo, 1000),
    coalesce(p."gamesPlayed", 0),
    coalesce(p.wins, 0)
  from public.profiles p
  on conflict (season_label, profile_id) do nothing;

  -- Season ladder starts equally for every existing account. Premium,
  -- moderation and identity fields are deliberately left unchanged.
  update public.profiles
  set elo = 1000,
      "gamesPlayed" = 0,
      wins = 0
  where elo is distinct from 1000
     or "gamesPlayed" is distinct from 0
     or wins is distinct from 0;
end;
$$;

comment on table public.season_profile_snapshots is
  'Immutable snapshots of profile ladder values at season transitions; Beta is archived before Season 01 starts.';
