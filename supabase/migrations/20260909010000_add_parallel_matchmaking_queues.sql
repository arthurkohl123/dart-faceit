-- A player may search on more than one scoring platform at the same time.
-- A match on any selected platform atomically removes all other queue rows for
-- both players, so a user can never receive two invitations.

alter table public.matchmaking_queue
  drop constraint if exists matchmaking_queue_pkey;

alter table public.matchmaking_queue
  add primary key (user_id, app);

create index if not exists matchmaking_queue_active_match_idx
  on public.matchmaking_queue (app, elo, joined_at);

create or replace function public.get_matchmaking_queue_counts()
returns table(app text, player_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select q.app, count(*)::bigint
  from public.matchmaking_queue q
  where coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
  group by q.app
  union all
  select '__total__', count(distinct q.user_id)::bigint
  from public.matchmaking_queue q
  where coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds';
$$;

revoke all on function public.get_matchmaking_queue_counts() from public;
grant execute on function public.get_matchmaking_queue_counts() to authenticated;

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
  v_match_id uuid;
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
     or cardinality(v_apps) <> cardinality(array(select distinct trim(value) from unnest(coalesce(p_apps, '{}'::text[])) as app(value))) then
    raise exception 'INVALID_MATCHMAKING_PLATFORM';
  end if;

  -- Polls from the same browser can overlap. Serialising each player's queue
  -- change prevents two requests from creating separate invitations.
  perform pg_advisory_xact_lock(hashtext('rankeddarts.queue.' || v_uid::text));

  update public.active_matches
  set status = 'cancelled', updated_at = now()
  where status = 'pending_accept'
    and accept_deadline is not null
    and accept_deadline <= now()
    and (player1_id = v_uid or player2_id = v_uid);

  delete from public.matchmaking_queue
  where coalesce(last_seen, joined_at) < now() - interval '45 seconds';

  select elo, username into v_elo, v_username
  from public.profiles
  where "supabaseId" = v_uid::text
    and coalesce(is_banned, false) = false;

  if not found then
    raise exception 'ACCOUNT_BANNED_OR_PROFILE_MISSING';
  end if;

  if 'scolia' = any(v_apps) and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text and nullif(trim(scolia_username), '') is not null
  ) then
    raise exception 'SCOLIA_USERNAME_REQUIRED';
  end if;
  if 'dartcounter' = any(v_apps) and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text and nullif(trim(dartcounter_username), '') is not null
  ) then
    raise exception 'DARTCOUNTER_USERNAME_REQUIRED';
  end if;
  if 'autodarts' = any(v_apps) and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text and nullif(trim(autodarts_username), '') is not null
  ) then
    raise exception 'AUTODARTS_USERNAME_REQUIRED';
  end if;

  if exists (
    select 1 from public.active_matches
    where (player1_id = v_uid or player2_id = v_uid)
      and status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then
    raise exception 'ACTIVE_MATCH_EXISTS';
  end if;

  -- Removing deselected platforms happens in the same transaction as adding
  -- newly selected ones. Existing selected rows retain their original wait
  -- time while their heartbeat and current Elo are refreshed.
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
    -- Do not block competing polls: if the other player is currently being
    -- processed, leave both queues intact and let the next two-second poll try.
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

create or replace function public.check_and_join_queue(p_max_elo_diff integer, p_app text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.check_and_join_queues(p_max_elo_diff, array[p_app]);
end;
$$;

revoke all on function public.check_and_join_queues(integer, text[]) from public;
grant execute on function public.check_and_join_queues(integer, text[]) to authenticated;
revoke all on function public.check_and_join_queue(integer, text) from public;
grant execute on function public.check_and_join_queue(integer, text) to authenticated;
