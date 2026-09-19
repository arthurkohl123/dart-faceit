-- Ranked-Slots are intentionally private availability entries. Browser clients
-- only receive aggregated interest per time window through the RPC below.

create table if not exists public.ranked_play_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ranked_play_slots_duration_check
    check (ends_at = starts_at + interval '1 hour'),
  constraint ranked_play_slots_ranked_hours_check
    check (
      extract(minute from starts_at at time zone 'Europe/Berlin') = 0
      and extract(second from starts_at at time zone 'Europe/Berlin') = 0
      and extract(hour from starts_at at time zone 'Europe/Berlin') between 17 and 22
    )
);

create unique index if not exists ranked_play_slots_user_starts_key
  on public.ranked_play_slots (user_id, starts_at);

-- Covers both the generated-slot aggregation and regular removal of old rows.
create index if not exists ranked_play_slots_starts_user_idx
  on public.ranked_play_slots (starts_at, user_id);

alter table public.ranked_play_slots enable row level security;

-- No direct browser read/write access: identities must stay private even from
-- other authenticated players. The two RPCs below are the complete API.
revoke all on table public.ranked_play_slots from anon, authenticated;

create or replace function public.get_ranked_play_slots(p_days integer default 7)
returns table(
  starts_at timestamptz,
  ends_at timestamptz,
  planned_players bigint,
  joined_by_me boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := (select auth.uid());
  v_berlin_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_days not between 1 and 7 then
    raise exception 'INVALID_SLOT_RANGE';
  end if;

  return query
  with candidate_slots as (
    select
      ((day_value::date + make_time(hour_value, 0, 0)) at time zone 'Europe/Berlin') as candidate_starts_at
    from generate_series(v_berlin_today, v_berlin_today + (p_days - 1), interval '1 day') as day_value
    cross join unnest(array[17, 18, 19, 20, 21, 22]) as hour_value
  )
  select
    candidates.candidate_starts_at as starts_at,
    candidates.candidate_starts_at + interval '1 hour' as ends_at,
    count(slots.user_id)::bigint as planned_players,
    coalesce(bool_or(slots.user_id = v_uid), false) as joined_by_me
  from candidate_slots candidates
  left join public.ranked_play_slots slots
    on slots.starts_at = candidates.candidate_starts_at
  where candidates.candidate_starts_at >= date_trunc('hour', now())
  group by candidates.candidate_starts_at
  order by candidates.candidate_starts_at;
end;
$$;

create or replace function public.toggle_ranked_play_slot(p_starts_at timestamptz)
returns table(joined boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_local_start timestamp;
  v_open_slots integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_starts_at is null then
    raise exception 'INVALID_SLOT';
  end if;

  v_local_start := p_starts_at at time zone 'Europe/Berlin';
  if extract(minute from v_local_start) <> 0
    or extract(second from v_local_start) <> 0
    or extract(hour from v_local_start) not between 17 and 22 then
    raise exception 'INVALID_SLOT';
  end if;

  -- A player can never accidentally create two entries while double-clicking.
  perform pg_advisory_xact_lock(hashtext('rankeddarts.play-slot.' || v_uid::text));

  if exists (
    select 1
    from public.ranked_play_slots slots
    where slots.user_id = v_uid
      and slots.starts_at = p_starts_at
  ) then
    delete from public.ranked_play_slots slots
    where slots.user_id = v_uid
      and slots.starts_at = p_starts_at;
    return query select false;
    return;
  end if;

  if p_starts_at < now() + interval '15 minutes'
    or p_starts_at > now() + interval '7 days' then
    raise exception 'SLOT_OUT_OF_RANGE';
  end if;

  select count(*)::integer
  into v_open_slots
  from public.ranked_play_slots slots
  where slots.user_id = v_uid
    and slots.starts_at >= now();

  if v_open_slots >= 6 then
    raise exception 'SLOT_LIMIT_REACHED';
  end if;

  -- Keep the small private table bounded without a separate cleanup job.
  delete from public.ranked_play_slots slots
  where slots.starts_at < now() - interval '7 days';

  insert into public.ranked_play_slots (user_id, starts_at, ends_at)
  values (v_uid, p_starts_at, p_starts_at + interval '1 hour');

  return query select true;
end;
$$;

revoke all on function public.get_ranked_play_slots(integer) from public;
revoke all on function public.get_ranked_play_slots(integer) from anon;
grant execute on function public.get_ranked_play_slots(integer) to authenticated;

revoke all on function public.toggle_ranked_play_slot(timestamptz) from public;
revoke all on function public.toggle_ranked_play_slot(timestamptz) from anon;
grant execute on function public.toggle_ranked_play_slot(timestamptz) to authenticated;

comment on table public.ranked_play_slots is
  'Private Ranked-Slot availability. Player identities are only available through aggregate RPC output.';
