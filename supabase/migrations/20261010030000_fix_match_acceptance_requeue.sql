-- Keep acceptance timeouts deterministic:
--   * the player who accepted may continue searching;
--   * the player who did not accept is removed from the queue;
--   * expired invitations carry an explicit cancellation reason.

create or replace function public.expire_match_accept(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.active_matches%rowtype;
  v_uid uuid := auth.uid();
  v_current_player_accepted boolean;
begin
  select *
  into v_match
  from public.active_matches
  where id = p_match_id
  for update;

  if not found then
    return json_build_object('status', 'error', 'message', 'Match nicht gefunden.');
  end if;

  if v_uid is not null
     and v_uid not in (v_match.player1_id, v_match.player2_id)
     and auth.role() <> 'service_role' then
    raise exception 'NOT_MATCH_PARTICIPANT';
  end if;
  if v_uid is null
     and auth.role() <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_match.status <> 'pending_accept' then
    return json_build_object('status', 'already_handled');
  end if;
  if v_match.accept_deadline is not null and now() < v_match.accept_deadline then
    return json_build_object(
      'status', 'not_expired',
      'remaining', extract(epoch from (v_match.accept_deadline - now()))::integer
    );
  end if;

  v_current_player_accepted := case
    when v_uid = v_match.player1_id then coalesce(v_match.player1_accepted, false)
    when v_uid = v_match.player2_id then coalesce(v_match.player2_accepted, false)
    else false
  end;

  update public.active_matches
  set status = 'cancelled',
      cancellation_reason = 'accept_timeout',
      updated_at = now()
  where id = p_match_id
    and status = 'pending_accept';

  -- Only a player who did not accept is removed from the queue. The accepted
  -- player is allowed to continue searching through the client recovery flow.
  if not coalesce(v_match.player1_accepted, false) then
    delete from public.matchmaking_queue where user_id = v_match.player1_id;
  end if;
  if not coalesce(v_match.player2_accepted, false) then
    delete from public.matchmaking_queue where user_id = v_match.player2_id;
  end if;

  return json_build_object(
    'status', 'expired',
    'reason', 'accept_timeout',
    'requeue_current', v_current_player_accepted,
    'removed_current_from_queue', not v_current_player_accepted
  );
end;
$$;

revoke all on function public.expire_match_accept(uuid) from public;
grant execute on function public.expire_match_accept(uuid) to authenticated;

create or replace function public.decline_match_invitation(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select *
  into v_match
  from public.active_matches
  where id = p_match_id
  for update;

  if not found then
    return json_build_object('status', 'not_found');
  end if;
  if v_uid not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'NOT_MATCH_PARTICIPANT';
  end if;
  if v_match.status <> 'pending_accept' then
    return json_build_object('status', 'already_handled', 'match_status', v_match.status);
  end if;

  update public.active_matches
  set status = 'cancelled',
      cancellation_reason = 'declined',
      updated_at = now()
  where id = p_match_id
    and status = 'pending_accept';

  -- The declining player must not remain eligible through a stale queue row.
  delete from public.matchmaking_queue where user_id = v_uid;

  insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
  values (p_match_id, v_uid, 'invitation_declined', 'pending_accept', 'cancelled', '{}'::jsonb);

  return json_build_object(
    'status', 'declined',
    'match_id', p_match_id,
    'removed_from_queue', true
  );
end;
$$;

revoke all on function public.decline_match_invitation(uuid) from public;
grant execute on function public.decline_match_invitation(uuid) to authenticated;

create or replace function public.cleanup_expired_match_acceptances()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.active_matches%rowtype;
  v_cancelled integer := 0;
begin
  for v_match in
    select *
    from public.active_matches
    where status = 'pending_accept'
      and accept_deadline is not null
      and accept_deadline <= now()
    for update
  loop
    update public.active_matches
    set status = 'cancelled',
        cancellation_reason = 'accept_timeout',
        updated_at = now()
    where id = v_match.id
      and status = 'pending_accept';

    if not coalesce(v_match.player1_accepted, false) then
      delete from public.matchmaking_queue where user_id = v_match.player1_id;
    end if;
    if not coalesce(v_match.player2_accepted, false) then
      delete from public.matchmaking_queue where user_id = v_match.player2_id;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  return v_cancelled;
end;
$$;

revoke all on function public.cleanup_expired_match_acceptances() from public;
grant execute on function public.cleanup_expired_match_acceptances() to authenticated;

-- The parallel queue matcher also expires invitations during a normal poll.
-- Keep that path consistent with the explicit expire endpoint.
create or replace function public.check_and_join_queues(
  p_max_elo_diff integer,
  p_apps text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_apps text[];
  v_elo integer;
  v_username text;
  v_candidate record;
  v_expired public.active_matches%rowtype;
  v_match_id uuid;
  v_current_expired_without_accept boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_max_elo_diff not between 25 and 500 then
    raise exception 'INVALID_ELO_RANGE';
  end if;

  select array_agg(distinct trim(value) order by trim(value))
  into v_apps
  from unnest(coalesce(p_apps, '{}'::text[])) as app(value)
  where trim(value) in ('scolia', 'dartcounter', 'autodarts');

  if coalesce(cardinality(v_apps), 0) = 0
     or cardinality(v_apps) <> cardinality(array(
       select distinct trim(value)
       from unnest(coalesce(p_apps, '{}'::text[])) as app(value)
     )) then
    raise exception 'INVALID_MATCHMAKING_PLATFORM';
  end if;

  perform pg_advisory_xact_lock(hashtext('rankeddarts.queue.' || v_uid::text));

  -- Expire every pending invitation for this player that has passed its
  -- deadline. Non-accepting players are removed; accepting players may poll
  -- again and continue searching.
  for v_expired in
    select *
    from public.active_matches
    where status = 'pending_accept'
      and accept_deadline is not null
      and accept_deadline <= now()
      and (player1_id = v_uid or player2_id = v_uid)
    for update
  loop
    update public.active_matches
    set status = 'cancelled',
        cancellation_reason = 'accept_timeout',
        updated_at = now()
    where id = v_expired.id
      and status = 'pending_accept';

    if not coalesce(v_expired.player1_accepted, false) then
      delete from public.matchmaking_queue where user_id = v_expired.player1_id;
    end if;
    if not coalesce(v_expired.player2_accepted, false) then
      delete from public.matchmaking_queue where user_id = v_expired.player2_id;
    end if;

    if not coalesce(
      case
        when v_expired.player1_id = v_uid then v_expired.player1_accepted
        when v_expired.player2_id = v_uid then v_expired.player2_accepted
        else false
      end,
      false
    ) then
      v_current_expired_without_accept := true;
    end if;
  end loop;

  delete from public.matchmaking_queue
  where coalesce(last_seen, joined_at) < now() - interval '45 seconds';

  select elo, username
  into v_elo, v_username
  from public.profiles
  where "supabaseId" = v_uid::text
    and coalesce(is_banned, false) = false;

  if not found then
    raise exception 'ACCOUNT_BANNED_OR_PROFILE_MISSING';
  end if;

  if 'scolia' = any(v_apps) and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text
      and nullif(trim(scolia_username), '') is not null
  ) then
    raise exception 'SCOLIA_USERNAME_REQUIRED';
  end if;
  if 'dartcounter' = any(v_apps) and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text
      and nullif(trim(dartcounter_username), '') is not null
  ) then
    raise exception 'DARTCOUNTER_USERNAME_REQUIRED';
  end if;
  if 'autodarts' = any(v_apps) and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text
      and nullif(trim(autodarts_username), '') is not null
  ) then
    raise exception 'AUTODARTS_USERNAME_REQUIRED';
  end if;

  -- A missed invitation must not immediately put the same browser back into
  -- the queue. The client returns to idle and the player can search again.
  if v_current_expired_without_accept then
    return json_build_object(
      'match_status', 'accept_expired',
      'match_id', null,
      'player_elo', v_elo,
      'apps', v_apps
    );
  end if;

  if exists (
    select 1
    from public.active_matches
    where (player1_id = v_uid or player2_id = v_uid)
      and status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then
    raise exception 'ACTIVE_MATCH_EXISTS';
  end if;

  delete from public.matchmaking_queue
  where user_id = v_uid
    and app <> all(v_apps);

  insert into public.matchmaking_queue (user_id, username, elo, app, joined_at, last_seen)
  select v_uid, v_username, v_elo, app, now(), now()
  from unnest(v_apps) as selected(app)
  on conflict (user_id, app) do update
  set username = excluded.username,
      elo = excluded.elo,
      last_seen = excluded.last_seen;

  for v_candidate in
    select q.user_id, q.username, q.elo, q.app
    from public.matchmaking_queue q
    where q.user_id <> v_uid
      and q.app = any(v_apps)
      and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
      and abs(q.elo - v_elo) <= p_max_elo_diff
    order by abs(q.elo - v_elo), q.joined_at
    for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtext('rankeddarts.queue.' || v_candidate.user_id::text)) then
      continue;
    end if;

    if exists (
      select 1 from public.active_matches
      where (player1_id = v_candidate.user_id or player2_id = v_candidate.user_id)
        and status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
    ) then
      delete from public.matchmaking_queue where user_id = v_candidate.user_id;
      continue;
    end if;

    insert into public.active_matches (
      player1_id, player2_id,
      player1_username, player2_username,
      player1_elo, player2_elo,
      app, status, accept_deadline,
      player1_accepted, player2_accepted, created_at
    ) values (
      v_uid, v_candidate.user_id,
      v_username, v_candidate.username,
      v_elo, v_candidate.elo,
      v_candidate.app, 'pending_accept', now() + interval '30 seconds',
      false, false, now()
    ) returning id into v_match_id;

    delete from public.matchmaking_queue
    where user_id in (v_uid, v_candidate.user_id);

    -- Only the match id and safe routing fields are returned in this phase.
    -- Opponent identity is shown after both players accept on /result.
    return json_build_object(
      'match_status', 'pending_accept',
      'match_id', v_match_id,
      'app', v_candidate.app,
      'player_elo', v_elo
    );
  end loop;

  return json_build_object(
    'match_status', 'searching',
    'match_id', null,
    'player_elo', v_elo,
    'apps', v_apps
  );
end;
$$;

revoke all on function public.check_and_join_queues(integer, text[]) from public;
grant execute on function public.check_and_join_queues(integer, text[]) to authenticated;
