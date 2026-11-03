-- Players can request live assistance without exposing staff presence or the
-- notification inbox. Calls are rate-limited per player and matchroom.
create table if not exists public.matchroom_staff_calls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.active_matches(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  notified_staff_count smallint not null default 0 check (notified_staff_count >= 0)
);

create index if not exists matchroom_staff_calls_match_requested_idx
  on public.matchroom_staff_calls (match_id, requested_at desc);

create index if not exists matchroom_staff_calls_requester_requested_idx
  on public.matchroom_staff_calls (requester_id, requested_at desc);

alter table public.matchroom_staff_calls enable row level security;
revoke all on table public.matchroom_staff_calls from public, anon, authenticated;

create or replace function public.get_matchroom_staff_availability(p_match_id uuid)
returns table (
  is_available boolean,
  staff_online integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Anmeldung erforderlich.';
  end if;

  if not exists (
    select 1
    from public.active_matches matchroom
    where matchroom.id = p_match_id
      and (
        v_actor_id in (matchroom.player1_id, matchroom.player2_id)
        or public.is_mod_or_admin()
      )
  ) then
    raise exception 'Kein Zugriff auf diesen Matchroom.';
  end if;

  return query
  select
    count(*) > 0,
    count(*)::integer
  from public.user_presence presence
  join public.profiles profile on profile."supabaseId" = presence.user_id::text
  where presence.last_seen_at >= now() - interval '2 minutes'
    and (coalesce(profile.is_admin, false) or coalesce(profile.is_moderator, false));
end;
$$;

create or replace function public.request_matchroom_staff_assistance(p_match_id uuid)
returns table (
  status text,
  staff_online integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_match public.active_matches%rowtype;
  v_requester_username text;
  v_online_count integer := 0;
  v_last_call_at timestamptz;
  v_retry_after_seconds integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Anmeldung erforderlich.';
  end if;

  select *
  into v_match
  from public.active_matches matchroom
  where matchroom.id = p_match_id
  for share;

  if not found then
    raise exception 'Matchroom nicht gefunden.';
  end if;

  if v_actor_id not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'Nur Teilnehmer können das Team in den Matchroom rufen.';
  end if;

  if v_match.status not in ('pending_result', 'awaiting_confirmation', 'disputed') then
    raise exception 'Dieser Matchroom ist nicht mehr aktiv.';
  end if;

  -- The advisory lock closes the small race window between two parallel clicks.
  perform pg_advisory_xact_lock(hashtextextended(p_match_id::text || v_actor_id::text, 0));

  select count(*)::integer
  into v_online_count
  from public.user_presence presence
  join public.profiles profile on profile."supabaseId" = presence.user_id::text
  where presence.last_seen_at >= now() - interval '2 minutes'
    and (coalesce(profile.is_admin, false) or coalesce(profile.is_moderator, false))
    and presence.user_id <> v_actor_id;

  if v_online_count = 0 then
    return query select 'offline'::text, 0, 0;
    return;
  end if;

  select call.requested_at
  into v_last_call_at
  from public.matchroom_staff_calls call
  where call.match_id = p_match_id
    and call.requester_id = v_actor_id
  order by call.requested_at desc
  limit 1;

  if v_last_call_at is not null and v_last_call_at > now() - interval '2 minutes' then
    v_retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_last_call_at + interval '2 minutes') - now()))::integer
    );
    return query select 'cooldown'::text, v_online_count, v_retry_after_seconds;
    return;
  end if;

  select coalesce(nullif(btrim(profile.username), ''), 'Ein Spieler')
  into v_requester_username
  from public.profiles profile
  where profile."supabaseId" = v_actor_id::text;

  insert into public.matchroom_staff_calls (match_id, requester_id, notified_staff_count)
  values (p_match_id, v_actor_id, v_online_count);

  insert into public.notifications (user_id, type, title, body, href)
  select
    presence.user_id,
    'matchroom_staff_call',
    'Unterstützung im Matchroom angefragt',
    format(
      '%s braucht Unterstützung: %s gegen %s.',
      coalesce(v_requester_username, 'Ein Spieler'),
      coalesce(v_match.player1_username, 'Spieler 1'),
      coalesce(v_match.player2_username, 'Spieler 2')
    ),
    '/result?matchId=' || v_match.id || '&bestOf=' || coalesce(v_match.best_of, 7)
  from public.user_presence presence
  join public.profiles profile on profile."supabaseId" = presence.user_id::text
  where presence.last_seen_at >= now() - interval '2 minutes'
    and (coalesce(profile.is_admin, false) or coalesce(profile.is_moderator, false))
    and presence.user_id <> v_actor_id;

  return query select 'notified'::text, v_online_count, 0;
end;
$$;

revoke all on function public.get_matchroom_staff_availability(uuid) from public, anon;
revoke all on function public.request_matchroom_staff_assistance(uuid) from public, anon;
grant execute on function public.get_matchroom_staff_availability(uuid) to authenticated;
grant execute on function public.request_matchroom_staff_assistance(uuid) to authenticated;

comment on table public.matchroom_staff_calls is
  'Auditable, rate-limited requests for online moderators or admins to join an active matchroom.';
