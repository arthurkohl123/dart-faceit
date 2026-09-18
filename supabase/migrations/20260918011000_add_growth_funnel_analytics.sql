-- Privacy-conscious growth funnel for the RankedDarts first-match journey.
--
-- This deliberately records only one timestamp per existing account journey:
-- first queue entry and first completed normal Ranked queue match. It stores no
-- IP address, device/browser fingerprint, URL history, email address or text
-- entered by a player. Profile readiness is derived from the existing profile
-- fields at read time so there is no duplicate personal profile data.

create table if not exists public.growth_funnel_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null check (event_name in ('first_queue_joined', 'first_ranked_queue_match_completed')),
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, event_name)
);

create index if not exists growth_funnel_events_name_at_idx
  on public.growth_funnel_events (event_name, event_at desc);

create index if not exists growth_funnel_events_profile_idx
  on public.growth_funnel_events (profile_id, event_name);

alter table public.growth_funnel_events enable row level security;
revoke all on table public.growth_funnel_events from anon, authenticated;

create or replace function public.record_growth_funnel_event(
  p_profile_id uuid,
  p_event_name text,
  p_event_at timestamptz default now()
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.growth_funnel_events(profile_id, event_name, event_at)
  values (p_profile_id, p_event_name, coalesce(p_event_at, now()))
  on conflict (profile_id, event_name) do nothing;
end;
$$;

-- A player can select several platforms at once. The unique constraint keeps
-- the first selected platform queue as exactly one funnel step.
create or replace function public.track_first_growth_queue_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id
  from public.profiles
  where "supabaseId" = new.user_id::text;

  if v_profile_id is not null then
    perform public.record_growth_funnel_event(v_profile_id, 'first_queue_joined', coalesce(new.joined_at, now()));
  end if;

  return new;
end;
$$;

drop trigger if exists track_first_growth_queue_entry on public.matchmaking_queue;
create trigger track_first_growth_queue_entry
after insert on public.matchmaking_queue
for each row execute function public.track_first_growth_queue_entry();

-- Only regular Ranked queue matches count. Private friend matches and
-- tournament pairings intentionally do not alter this acquisition funnel.
create or replace function public.track_first_growth_completed_queue_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player1_profile_id uuid;
  v_player2_profile_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  if coalesce(new.match_mode, 'ranked') <> 'ranked'
     or exists (select 1 from public.tournament_matches tm where tm.active_match_id = new.id) then
    return new;
  end if;

  select id into v_player1_profile_id from public.profiles where "supabaseId" = new.player1_id::text;
  select id into v_player2_profile_id from public.profiles where "supabaseId" = new.player2_id::text;

  if v_player1_profile_id is not null then
    perform public.record_growth_funnel_event(v_player1_profile_id, 'first_ranked_queue_match_completed', coalesce(new.completed_at, now()));
  end if;
  if v_player2_profile_id is not null then
    perform public.record_growth_funnel_event(v_player2_profile_id, 'first_ranked_queue_match_completed', coalesce(new.completed_at, now()));
  end if;

  return new;
end;
$$;

drop trigger if exists track_first_growth_completed_queue_match on public.active_matches;
create trigger track_first_growth_completed_queue_match
after update of status on public.active_matches
for each row execute function public.track_first_growth_completed_queue_match();

-- Give the dashboard a useful baseline without manufacturing abandoned queue
-- attempts from the past. Historical queue entries can only be reconstructed
-- when they actually led to a completed normal Ranked queue match.
insert into public.growth_funnel_events(profile_id, event_name, event_at)
select p.id, 'first_queue_joined', historical.first_queue_at
from public.profiles p
join lateral (
  select min(am.created_at) as first_queue_at
  from public.active_matches am
  where coalesce(am.match_mode, 'ranked') = 'ranked'
    and am.status = 'completed'
    and not exists (select 1 from public.tournament_matches tm where tm.active_match_id = am.id)
    and (am.player1_id::text = p."supabaseId" or am.player2_id::text = p."supabaseId")
) historical on historical.first_queue_at is not null
on conflict (profile_id, event_name) do nothing;

insert into public.growth_funnel_events(profile_id, event_name, event_at)
select p.id, 'first_ranked_queue_match_completed', historical.first_completed_at
from public.profiles p
join lateral (
  select min(coalesce(am.completed_at, am.updated_at, am.created_at)) as first_completed_at
  from public.active_matches am
  where coalesce(am.match_mode, 'ranked') = 'ranked'
    and am.status = 'completed'
    and not exists (select 1 from public.tournament_matches tm where tm.active_match_id = am.id)
    and (am.player1_id::text = p."supabaseId" or am.player2_id::text = p."supabaseId")
) historical on historical.first_completed_at is not null
on conflict (profile_id, event_name) do nothing;

create or replace function public.admin_get_growth_funnel(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_since timestamptz;
  v_result jsonb;
begin
  perform public.admin_require_operations_access('read');
  v_since := now() - make_interval(days => v_days);

  with cohort as (
    select
      p.id,
      p.created_at,
      (
        coalesce(p.phone_verified, false)
        and (
          nullif(btrim(coalesce(p.scolia_username, '')), '') is not null
          or nullif(btrim(coalesce(p.dartcounter_username, '')), '') is not null
          or nullif(btrim(coalesce(p.autodarts_username, '')), '') is not null
        )
      ) as profile_ready
    from public.profiles p
    where p.created_at >= v_since
      and coalesce(p.is_banned, false) = false
  ), journey as (
    select
      c.*,
      queue.event_at as first_queue_at,
      completed.event_at as first_completed_at
    from cohort c
    left join public.growth_funnel_events queue
      on queue.profile_id = c.id and queue.event_name = 'first_queue_joined'
    left join public.growth_funnel_events completed
      on completed.profile_id = c.id and completed.event_name = 'first_ranked_queue_match_completed'
  ), totals as (
    select
      count(*)::integer as registered,
      count(*) filter (where profile_ready)::integer as profile_ready,
      count(*) filter (where first_queue_at is not null)::integer as first_queue_joined,
      count(*) filter (where first_completed_at is not null)::integer as first_match_completed,
      round(avg(extract(epoch from (first_queue_at - created_at)) / 60.0) filter (where first_queue_at is not null), 1) as medianless_avg_minutes_to_queue,
      round(avg(extract(epoch from (first_completed_at - created_at)) / 60.0) filter (where first_completed_at is not null), 1) as medianless_avg_minutes_to_match
    from journey
  ), daily as (
    select
      day::date as day,
      count(j.id)::integer as registered,
      count(j.id) filter (where j.profile_ready)::integer as profile_ready,
      count(j.id) filter (where j.first_queue_at is not null)::integer as first_queue_joined,
      count(j.id) filter (where j.first_completed_at is not null)::integer as first_match_completed
    from generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') day
    left join journey j on j.created_at >= day and j.created_at < day + interval '1 day'
    group by day
    order by day
  )
  select jsonb_build_object(
    'window_days', v_days,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'registered', totals.registered,
      'profile_ready', totals.profile_ready,
      'first_queue_joined', totals.first_queue_joined,
      'first_match_completed', totals.first_match_completed,
      'profile_ready_rate', coalesce(round(100.0 * totals.profile_ready / nullif(totals.registered, 0), 1), 0),
      'queue_rate', coalesce(round(100.0 * totals.first_queue_joined / nullif(totals.profile_ready, 0), 1), 0),
      'match_rate', coalesce(round(100.0 * totals.first_match_completed / nullif(totals.first_queue_joined, 0), 1), 0),
      'overall_match_rate', coalesce(round(100.0 * totals.first_match_completed / nullif(totals.registered, 0), 1), 0),
      'avg_minutes_to_queue', coalesce(totals.medianless_avg_minutes_to_queue, 0),
      'avg_minutes_to_match', coalesce(totals.medianless_avg_minutes_to_match, 0)
    ),
    'drop_off', jsonb_build_object(
      'before_profile_ready', greatest(totals.registered - totals.profile_ready, 0),
      'before_first_queue', greatest(totals.profile_ready - totals.first_queue_joined, 0),
      'before_first_match', greatest(totals.first_queue_joined - totals.first_match_completed, 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'registered', registered, 'profile_ready', profile_ready, 'first_queue_joined', first_queue_joined, 'first_match_completed', first_match_completed) order by day) from daily), '[]'::jsonb)
  ) into v_result
  from totals;

  return v_result;
end;
$$;

revoke all on function public.record_growth_funnel_event(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_get_growth_funnel(integer) from public, anon;
revoke all on function public.track_first_growth_queue_entry(), public.track_first_growth_completed_queue_match() from public, anon, authenticated;
grant execute on function public.admin_get_growth_funnel(integer) to authenticated;
