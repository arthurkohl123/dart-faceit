-- Social layer: friendships, online presence and private direct challenges.
-- Private challenges deliberately use active_matches for the proven result-room
-- workflow, but are explicitly excluded from ranked Elo, daily limits, public
-- live matches and public player statistics.

alter table public.active_matches
  add column if not exists match_mode text not null default 'ranked';

alter table public.active_matches
  drop constraint if exists active_matches_match_mode_check,
  add constraint active_matches_match_mode_check
    check (match_mode in ('ranked', 'private'));

alter table public.matches
  add column if not exists match_mode text not null default 'ranked';

alter table public.matches
  drop constraint if exists matches_match_mode_check,
  add constraint matches_match_mode_check
    check (match_mode in ('ranked', 'private'));

create index if not exists active_matches_private_mode_idx
  on public.active_matches (match_mode, status, created_at desc);

create index if not exists matches_mode_user_created_idx
  on public.matches (match_mode, user_id, created_at desc);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_distinct_users check (requester_id <> recipient_id)
);

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (least(requester_id, recipient_id), greatest(requester_id, recipient_id));

create index if not exists friendships_recipient_pending_idx
  on public.friendships (recipient_id, created_at desc)
  where status = 'pending';

create index if not exists friendships_requester_idx
  on public.friendships (requester_id, created_at desc);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;

create table if not exists public.friend_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  challenged_id uuid not null references auth.users(id) on delete cascade,
  app text not null check (app in ('scolia', 'dartcounter', 'autodarts')),
  best_of integer not null check (best_of in (3, 5, 7, 9)),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  active_match_id uuid unique references public.active_matches(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_challenges_distinct_users check (challenger_id <> challenged_id)
);

create unique index if not exists friend_challenges_one_open_pair_idx
  on public.friend_challenges (least(challenger_id, challenged_id), greatest(challenger_id, challenged_id))
  where status = 'pending';

create index if not exists friend_challenges_recipient_open_idx
  on public.friend_challenges (challenged_id, expires_at asc)
  where status = 'pending';

create index if not exists friend_challenges_challenger_open_idx
  on public.friend_challenges (challenger_id, expires_at asc)
  where status = 'pending';

alter table public.friend_challenges enable row level security;
revoke all on public.friend_challenges from anon, authenticated;

-- Presence is intentionally a short lived activity signal, not a history of
-- visits. Clients refresh it at most once per minute while authenticated.
create or replace function public.heartbeat_user_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  insert into public.user_presence as presence (user_id, last_seen_at, updated_at)
  values (v_uid, now(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;
end;
$$;

-- Search exposes only the public player-card fields needed to send a request.
create or replace function public.search_friend_candidates(p_query text)
returns table(
  user_id uuid,
  username text,
  elo integer,
  friendship_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_query) < 2 then return; end if;

  return query
  select
    p."supabaseId"::uuid,
    coalesce(p.username, 'Spieler'),
    coalesce(p.elo, 1000),
    f.status
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = v_uid and f.recipient_id = p."supabaseId"::uuid)
    or (f.recipient_id = v_uid and f.requester_id = p."supabaseId"::uuid)
  where p."supabaseId" <> v_uid::text
    and coalesce(p.is_banned, false) = false
    and p.username is not null
    and p.username ilike '%' || v_query || '%'
  order by
    case when lower(p.username) = lower(v_query) then 0 else 1 end,
    p.username asc
  limit 12;
end;
$$;

create or replace function public.send_friend_request(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_friendship public.friendships%rowtype;
  v_my_name text;
  v_result_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_recipient_id is null or p_recipient_id = v_uid then raise exception 'INVALID_FRIEND_REQUEST'; end if;

  if not exists (
    select 1 from public.profiles p
    where p."supabaseId" = p_recipient_id::text and coalesce(p.is_banned, false) = false
  ) then raise exception 'PLAYER_NOT_FOUND'; end if;

  select * into v_friendship
  from public.friendships
  where least(requester_id, recipient_id) = least(v_uid, p_recipient_id)
    and greatest(requester_id, recipient_id) = greatest(v_uid, p_recipient_id)
  for update;

  if found then
    if v_friendship.status = 'accepted' then raise exception 'ALREADY_FRIENDS'; end if;
    if v_friendship.status = 'pending' and v_friendship.requester_id = v_uid then
      raise exception 'FRIEND_REQUEST_ALREADY_SENT';
    end if;
    if v_friendship.status = 'pending' then raise exception 'FRIEND_REQUEST_RECEIVED'; end if;

    update public.friendships
    set requester_id = v_uid,
        recipient_id = p_recipient_id,
        status = 'pending',
        created_at = now(),
        responded_at = null
    where id = v_friendship.id
    returning id into v_result_id;
  else
    insert into public.friendships (requester_id, recipient_id)
    values (v_uid, p_recipient_id)
    returning id into v_result_id;
  end if;

  select coalesce(username, 'Ein Spieler') into v_my_name
  from public.profiles where "supabaseId" = v_uid::text;

  insert into public.notifications(user_id, type, title, body, href)
  values (
    p_recipient_id,
    'friend_request',
    'Neue Freundschaftsanfrage',
    coalesce(v_my_name, 'Ein Spieler') || ' möchte dich als Freund hinzufügen.',
    '/friends'
  );

  return v_result_id;
end;
$$;

create or replace function public.respond_to_friend_request(
  p_friendship_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_friendship public.friendships%rowtype;
  v_my_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_friendship from public.friendships
  where id = p_friendship_id and recipient_id = v_uid and status = 'pending'
  for update;
  if not found then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;

  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = v_friendship.id;

  if p_accept then
    select coalesce(username, 'Dein neuer Freund') into v_my_name
    from public.profiles where "supabaseId" = v_uid::text;

    insert into public.notifications(user_id, type, title, body, href)
    values (
      v_friendship.requester_id,
      'friend_request_accepted',
      'Freundschaft bestätigt',
      coalesce(v_my_name, 'Dein neuer Freund') || ' hat deine Anfrage angenommen.',
      '/friends'
    );
  end if;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.friendships
  where id = p_friendship_id
    and status = 'accepted'
    and v_uid in (requester_id, recipient_id);
  if not found then raise exception 'FRIENDSHIP_NOT_FOUND'; end if;
end;
$$;

create or replace function public.list_my_friends()
returns table(
  friendship_id uuid,
  user_id uuid,
  username text,
  elo integer,
  is_online boolean,
  in_queue boolean,
  queue_app text,
  available_apps text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  return query
  with relationships as (
    select
      f.id as friendship_id,
      case when f.requester_id = v_uid then f.recipient_id else f.requester_id end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and v_uid in (f.requester_id, f.recipient_id)
  )
  select
    r.friendship_id,
    r.friend_id,
    coalesce(other_profile.username, 'Spieler'),
    coalesce(other_profile.elo, 1000),
    coalesce(presence.last_seen_at >= now() - interval '2 minutes', false),
    exists (
      select 1 from public.matchmaking_queue q
      where q.user_id = r.friend_id
        and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
    ),
    (
      select q.app from public.matchmaking_queue q
      where q.user_id = r.friend_id
        and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
      order by coalesce(q.last_seen, q.joined_at) desc
      limit 1
    ),
    array_remove(array[
      case when nullif(btrim(me.scolia_username), '') is not null and nullif(btrim(other_profile.scolia_username), '') is not null then 'scolia' else null end,
      case when nullif(btrim(me.dartcounter_username), '') is not null and nullif(btrim(other_profile.dartcounter_username), '') is not null then 'dartcounter' else null end,
      case when nullif(btrim(me.autodarts_username), '') is not null and nullif(btrim(other_profile.autodarts_username), '') is not null then 'autodarts' else null end
    ], null::text)
  from relationships r
  join public.profiles me on me."supabaseId" = v_uid::text
  join public.profiles other_profile on other_profile."supabaseId" = r.friend_id::text
  left join public.user_presence presence on presence.user_id = r.friend_id
  where coalesce(other_profile.is_banned, false) = false
  order by coalesce(presence.last_seen_at, 'epoch'::timestamptz) desc, other_profile.username asc;
end;
$$;

create or replace function public.list_my_friend_requests()
returns table(
  friendship_id uuid,
  user_id uuid,
  username text,
  elo integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
  select f.id, f.requester_id, coalesce(p.username, 'Spieler'), coalesce(p.elo, 1000), f.created_at
  from public.friendships f
  join public.profiles p on p."supabaseId" = f.requester_id::text
  where f.recipient_id = v_uid and f.status = 'pending'
  order by f.created_at desc;
end;
$$;

create or replace function public.create_friend_challenge(
  p_friend_id uuid,
  p_app text,
  p_best_of integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge_id uuid;
  v_my_name text;
  v_my_platform text;
  v_friend_platform text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_friend_id is null or p_friend_id = v_uid then raise exception 'INVALID_CHALLENGE'; end if;
  if p_app not in ('scolia', 'dartcounter', 'autodarts') then raise exception 'INVALID_MATCHMAKING_PLATFORM'; end if;
  if p_best_of not in (3, 5, 7, 9) then raise exception 'INVALID_MATCH_FORMAT'; end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_uid and f.recipient_id = p_friend_id)
        or (f.recipient_id = v_uid and f.requester_id = p_friend_id))
  ) then raise exception 'FRIENDSHIP_REQUIRED'; end if;

  if not exists (
    select 1 from public.user_presence presence
    where presence.user_id = p_friend_id
      and presence.last_seen_at >= now() - interval '2 minutes'
  ) then raise exception 'FRIEND_OFFLINE'; end if;

  if exists (
    select 1 from public.matchmaking_queue q
    where q.user_id in (v_uid, p_friend_id)
      and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
  ) then raise exception 'PLAYER_IN_QUEUE'; end if;

  if exists (
    select 1 from public.active_matches m
    where (m.player1_id in (v_uid, p_friend_id) or m.player2_id in (v_uid, p_friend_id))
      and m.status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_MATCH_EXISTS'; end if;

  select
    coalesce(username, 'Spieler'),
    nullif(btrim(case p_app when 'scolia' then scolia_username when 'dartcounter' then dartcounter_username else autodarts_username end), '')
  into v_my_name, v_my_platform
  from public.profiles where "supabaseId" = v_uid::text and coalesce(is_banned, false) = false;
  if not found then raise exception 'ACCOUNT_UNAVAILABLE'; end if;

  select nullif(btrim(case p_app when 'scolia' then scolia_username when 'dartcounter' then dartcounter_username else autodarts_username end), '')
  into v_friend_platform
  from public.profiles where "supabaseId" = p_friend_id::text and coalesce(is_banned, false) = false;
  if not found then raise exception 'FRIEND_UNAVAILABLE'; end if;
  if v_my_platform is null or v_friend_platform is null then raise exception 'PLATFORM_USERNAME_REQUIRED'; end if;

  update public.friend_challenges
  set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.friend_challenges c
    where c.status = 'pending' and c.expires_at > now()
      and least(c.challenger_id, c.challenged_id) = least(v_uid, p_friend_id)
      and greatest(c.challenger_id, c.challenged_id) = greatest(v_uid, p_friend_id)
  ) then raise exception 'CHALLENGE_ALREADY_PENDING'; end if;

  insert into public.friend_challenges (challenger_id, challenged_id, app, best_of)
  values (v_uid, p_friend_id, p_app, p_best_of)
  returning id into v_challenge_id;

  insert into public.notifications(user_id, type, title, body, href)
  values (
    p_friend_id,
    'friend_challenge',
    'Direkte Herausforderung',
    coalesce(v_my_name, 'Ein Freund') || ' fordert dich zu Best of ' || p_best_of || ' auf ' ||
      case p_app when 'scolia' then 'Scolia' when 'autodarts' then 'AutoDarts' else 'DartCounter' end || ' heraus.',
    '/friends'
  );

  return v_challenge_id;
end;
$$;

create or replace function public.list_my_friend_challenges()
returns table(
  challenge_id uuid,
  direction text,
  user_id uuid,
  username text,
  app text,
  best_of integer,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  update public.friend_challenges
  set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now()
    and v_uid in (challenger_id, challenged_id);

  return query
  select
    c.id,
    case when c.challenged_id = v_uid then 'incoming' else 'outgoing' end,
    case when c.challenged_id = v_uid then c.challenger_id else c.challenged_id end,
    coalesce(p.username, 'Spieler'),
    c.app,
    c.best_of,
    c.expires_at,
    c.created_at
  from public.friend_challenges c
  join public.profiles p on p."supabaseId" = (case when c.challenged_id = v_uid then c.challenger_id else c.challenged_id end)::text
  where c.status = 'pending'
    and c.expires_at > now()
    and v_uid in (c.challenger_id, c.challenged_id)
  order by c.expires_at asc;
end;
$$;

create or replace function public.respond_to_friend_challenge(
  p_challenge_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.friend_challenges%rowtype;
  v_p1_name text;
  v_p2_name text;
  v_p1_elo integer;
  v_p2_elo integer;
  v_match_id uuid;
  v_href text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_challenge
  from public.friend_challenges
  where id = p_challenge_id and challenged_id = v_uid and status = 'pending'
  for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_challenge.expires_at <= now() then
    update public.friend_challenges set status = 'expired', responded_at = now() where id = v_challenge.id;
    raise exception 'CHALLENGE_EXPIRED';
  end if;

  if not p_accept then
    update public.friend_challenges set status = 'declined', responded_at = now() where id = v_challenge.id;
    return jsonb_build_object('status', 'declined');
  end if;

  -- A direct challenge takes precedence over a waiting queue entry. Removing
  -- both entries first also prevents a normal match from being created later.
  delete from public.matchmaking_queue
  where user_id in (v_challenge.challenger_id, v_challenge.challenged_id);

  if exists (
    select 1 from public.active_matches m
    where (m.player1_id in (v_challenge.challenger_id, v_challenge.challenged_id)
       or m.player2_id in (v_challenge.challenger_id, v_challenge.challenged_id))
      and m.status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_MATCH_EXISTS'; end if;

  select coalesce(username, 'Spieler 1'), coalesce(elo, 1000)
  into v_p1_name, v_p1_elo
  from public.profiles
  where "supabaseId" = v_challenge.challenger_id::text and coalesce(is_banned, false) = false;
  if not found then raise exception 'CHALLENGER_UNAVAILABLE'; end if;

  select coalesce(username, 'Spieler 2'), coalesce(elo, 1000)
  into v_p2_name, v_p2_elo
  from public.profiles
  where "supabaseId" = v_challenge.challenged_id::text and coalesce(is_banned, false) = false;
  if not found then raise exception 'CHALLENGED_UNAVAILABLE'; end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_challenge.challenger_id and f.recipient_id = v_challenge.challenged_id)
        or (f.recipient_id = v_challenge.challenger_id and f.requester_id = v_challenge.challenged_id))
  ) then raise exception 'FRIENDSHIP_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p."supabaseId" = v_challenge.challenger_id::text
      and nullif(btrim(case v_challenge.app when 'scolia' then p.scolia_username when 'dartcounter' then p.dartcounter_username else p.autodarts_username end), '') is not null
  ) or not exists (
    select 1 from public.profiles p
    where p."supabaseId" = v_challenge.challenged_id::text
      and nullif(btrim(case v_challenge.app when 'scolia' then p.scolia_username when 'dartcounter' then p.dartcounter_username else p.autodarts_username end), '') is not null
  ) then raise exception 'PLATFORM_USERNAME_REQUIRED'; end if;

  insert into public.active_matches (
    player1_id, player2_id,
    player1_username, player2_username,
    player1_elo, player2_elo,
    app, best_of, match_mode, status
  ) values (
    v_challenge.challenger_id, v_challenge.challenged_id,
    v_p1_name, v_p2_name,
    v_p1_elo, v_p2_elo,
    v_challenge.app, v_challenge.best_of, 'private', 'pending_result'
  ) returning id into v_match_id;

  update public.friend_challenges
  set status = 'accepted', responded_at = now(), active_match_id = v_match_id
  where id = v_challenge.id;

  v_href := '/result?matchId=' || v_match_id || '&bestOf=' || v_challenge.best_of;
  insert into public.notifications(user_id, type, title, body, href) values
    (v_challenge.challenger_id, 'friend_challenge_accepted', 'Herausforderung angenommen', v_p2_name || ' ist bereit. Das private Duell kann starten.', v_href),
    (v_challenge.challenged_id, 'friend_challenge_accepted', 'Privates Duell bereit', v_p1_name || ' wartet im Matchroom.', v_href);

  return jsonb_build_object('status', 'accepted', 'match_id', v_match_id, 'best_of', v_challenge.best_of);
end;
$$;

create or replace function public.cancel_friend_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.friend_challenges
  set status = 'cancelled', responded_at = now()
  where id = p_challenge_id and challenger_id = v_uid and status = 'pending';
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;
end;
$$;

-- Private matches can use the shared result room without accidentally
-- consuming a free ranked game. Tournament rooms still begin directly in
-- pending_result and remain unaffected.
create or replace function public.enforce_free_daily_match_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_player_id uuid; v_is_premium boolean; v_matches_started integer; v_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if coalesce(new.match_mode, 'ranked') <> 'ranked' then return new; end if;
  if not (old.status = 'pending_accept' and new.status = 'pending_result') then return new; end if;
  foreach v_player_id in array array[new.player1_id, new.player2_id] loop
    select coalesce("isPremium", false) into v_is_premium from public.profiles where "supabaseId" = v_player_id::text;
    if not coalesce(v_is_premium, false) then
      insert into public.daily_ranked_match_usage as usage (user_id, usage_date, matches_started)
      values (v_player_id, v_today, 1)
      on conflict (user_id, usage_date) do update set matches_started = usage.matches_started + 1 where usage.matches_started < 4
      returning matches_started into v_matches_started;
      if not found then raise exception 'DAILY_MATCH_LIMIT: Free-Nutzer können maximal 4 Ranked Matches pro Tag starten.'; end if;
    end if;
  end loop;
  return new;
end;
$$;

-- Extend the established finalisation function instead of introducing a second
-- result path. This keeps confirmation, timeout, dispute and admin workflows
-- identical for direct duels while preserving competitive rankings.
create or replace function public.finalize_ranked_match_result(
  p_match_id uuid,
  p_confirmed_by uuid,
  p_confirmation_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.active_matches%rowtype;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_elo integer;
  v_loser_elo integer;
  v_elo_change integer := 0;
  v_p1_change integer := 0;
  v_p2_change integer := 0;
  v_rows integer;
  v_is_ranked boolean;
begin
  select * into v_match from public.active_matches
  where id = p_match_id and status = 'awaiting_confirmation'
  for update;
  if not found then raise exception 'MATCH_NOT_AWAITING_CONFIRMATION'; end if;
  if v_match.submitted_winner_id not in (v_match.player1_id, v_match.player2_id) then raise exception 'INVALID_SUBMITTED_WINNER'; end if;
  if v_match.player1_id = v_match.player2_id then raise exception 'INVALID_MATCH_PLAYERS'; end if;
  if exists (select 1 from public.matches where active_match_id = p_match_id) then raise exception 'MATCH_ALREADY_RATED'; end if;

  v_is_ranked := coalesce(v_match.match_mode, 'ranked') = 'ranked';
  v_winner_id := v_match.submitted_winner_id;
  if v_winner_id = v_match.player1_id then
    v_loser_id := v_match.player2_id; v_winner_elo := v_match.player1_elo; v_loser_elo := v_match.player2_elo;
  else
    v_loser_id := v_match.player1_id; v_winner_elo := v_match.player2_elo; v_loser_elo := v_match.player1_elo;
  end if;

  if v_is_ranked then
    v_elo_change := greatest(1, least(32, public.calculate_elo_change(v_winner_elo, v_loser_elo)));
    v_p1_change := case when v_winner_id = v_match.player1_id then v_elo_change else -v_elo_change end;
    v_p2_change := -v_p1_change;

    update public.profiles set elo = greatest(0, elo + v_elo_change),
      "gamesPlayed" = "gamesPlayed" + 1, wins = wins + 1
    where "supabaseId" = v_winner_id::text;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'WINNER_PROFILE_NOT_FOUND'; end if;

    update public.profiles set elo = greatest(0, elo - v_elo_change),
      "gamesPlayed" = "gamesPlayed" + 1
    where "supabaseId" = v_loser_id::text;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'LOSER_PROFILE_NOT_FOUND'; end if;
  end if;

  insert into public.matches(active_match_id,user_id,opponent_id,opponent_name,opponent_elo,
    legs_won,legs_lost,result,is_win,my_average,highest_checkout,one_eighties,elo_change,status,match_mode)
  values
    (p_match_id,v_match.player1_id,v_match.player2_id,v_match.player2_username,v_match.player2_elo,
      coalesce(v_match.submitted_player1_legs,0),coalesce(v_match.submitted_player2_legs,0),
      coalesce(v_match.submitted_player1_legs,0)::text||':'||coalesce(v_match.submitted_player2_legs,0)::text,
      v_winner_id=v_match.player1_id,v_match.submitted_player1_average,v_match.submitted_player1_checkout,
      coalesce(v_match.submitted_player1_180s,0),v_p1_change,'completed',coalesce(v_match.match_mode, 'ranked')),
    (p_match_id,v_match.player2_id,v_match.player1_id,v_match.player1_username,v_match.player1_elo,
      coalesce(v_match.submitted_player2_legs,0),coalesce(v_match.submitted_player1_legs,0),
      coalesce(v_match.submitted_player2_legs,0)::text||':'||coalesce(v_match.submitted_player1_legs,0)::text,
      v_winner_id=v_match.player2_id,v_match.submitted_player2_average,v_match.submitted_player2_checkout,
      coalesce(v_match.submitted_player2_180s,0),v_p2_change,'completed',coalesce(v_match.match_mode, 'ranked'));

  update public.active_matches set status='completed', confirmed_by=p_confirmed_by,
    completed_at=now(), updated_at=now() where id=p_match_id;

  insert into public.match_audit_log(match_id,actor_id,action,old_status,new_status,context)
  values(p_match_id,p_confirmed_by,
    case when v_is_ranked then 'elo_finalized' else 'private_match_finalized' end,
    'awaiting_confirmation','completed',
    jsonb_build_object('mode',p_confirmation_mode,'winner_id',v_winner_id,'elo_change',v_elo_change,'match_mode',coalesce(v_match.match_mode, 'ranked')));

  return jsonb_build_object(
    'result_status','success',
    'result_message',case when v_is_ranked then 'Match erfolgreich bestätigt.' else 'Privates Duell bestätigt. Elo und Saisonstatistiken bleiben unverändert.' end,
    'elo_change',v_elo_change
  );
end;
$$;

-- Missing a private duel can cancel that duel, but it must never issue a
-- ranked queue ban or add a no-show strike. Ranked and tournament behaviour is
-- otherwise unchanged.
create or replace function public.resolve_no_show(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
  v_absent_player uuid;
  v_ban_minutes integer := 15;
  v_setting jsonb;
  v_ban_until timestamptz;
begin
  select * into v_match from public.active_matches where id = p_match_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_uid is not null and v_uid <> v_match.no_show_reported_by and auth.role() <> 'service_role' then
    raise exception 'ONLY_REPORTER_CAN_RESOLVE_NO_SHOW';
  end if;
  if v_uid is null and auth.role() <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_match.no_show_resolved then return jsonb_build_object('status','already_resolved'); end if;
  if v_match.status <> 'pending_result' then return jsonb_build_object('status','invalid_status'); end if;
  if v_match.no_show_reported_at is null or v_match.no_show_reported_by is null then return jsonb_build_object('status','not_reported'); end if;
  if v_match.no_show_reported_at + interval '5 minutes' > now() then
    return jsonb_build_object('status','not_expired','remaining_seconds',greatest(0,extract(epoch from (v_match.no_show_reported_at + interval '5 minutes' - now()))::integer));
  end if;

  v_absent_player := case when v_match.no_show_reported_by = v_match.player1_id then v_match.player2_id else v_match.player1_id end;
  if coalesce(v_match.match_mode, 'ranked') = 'private' then
    update public.active_matches set status = 'cancelled', no_show_resolved = true, updated_at = now() where id = p_match_id;
    return jsonb_build_object('status','resolved','absent_player_id',v_absent_player,'private_match',true);
  end if;

  select value into v_setting from public.app_settings where key = 'no_show_queue_ban_minutes';
  v_ban_minutes := greatest(1,least(1440,coalesce((v_setting->>'minutes')::integer,15)));
  v_ban_until := now() + make_interval(mins => v_ban_minutes);
  update public.profiles set queue_banned_until = greatest(coalesce(queue_banned_until,now()),v_ban_until),
    queue_ban_reason = 'No-Show: Match nicht rechtzeitig betreten/bestätigt', no_show_strikes = coalesce(no_show_strikes,0) + 1
  where "supabaseId" = v_absent_player::text;
  update public.active_matches set status = 'cancelled', no_show_resolved = true, updated_at = now() where id = p_match_id;
  return jsonb_build_object('status','resolved','absent_player_id',v_absent_player,'queue_banned_until',v_ban_until,'queue_ban_minutes',v_ban_minutes);
end;
$$;

-- Result-room notifications use the exact per-match format for private duels
-- and make the no-rating nature clear in the inbox.
create or replace function public.notify_match_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient uuid;
  v_opponent text;
  v_href text;
  v_is_private boolean := coalesce(new.match_mode, 'ranked') = 'private';
begin
  if new.status = 'awaiting_confirmation' and old.status is distinct from 'awaiting_confirmation' then
    v_recipient := case when new.submitted_by = new.player1_id then new.player2_id else new.player1_id end;
    v_opponent := case when v_recipient = new.player1_id then new.player2_username else new.player1_username end;
    v_href := '/result?matchId=' || new.id || '&bestOf=' || coalesce(new.best_of, 7);
    insert into public.notifications(user_id, type, title, body, href)
    values (
      v_recipient,
      'match_confirmation',
      case when v_is_private then 'Privates Duell wartet auf dich' else 'Ergebnis wartet auf dich' end,
      coalesce(v_opponent, 'Dein Gegner') || ' hat ein Ergebnis eingereicht. Bitte bestätige oder widersprich.',
      v_href
    );
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.notifications(user_id, type, title, body, href) values
      (new.player1_id, 'match_completed', case when v_is_private then 'Privates Duell abgeschlossen' else 'Match abgeschlossen' end,
        case when v_is_private then 'Das Ergebnis wurde bestätigt. Elo und Saisonstatistiken bleiben unverändert.' else 'Das Ergebnis wurde bestätigt und dein Rating aktualisiert.' end, '/history'),
      (new.player2_id, 'match_completed', case when v_is_private then 'Privates Duell abgeschlossen' else 'Match abgeschlossen' end,
        case when v_is_private then 'Das Ergebnis wurde bestätigt. Elo und Saisonstatistiken bleiben unverändert.' else 'Das Ergebnis wurde bestätigt und dein Rating aktualisiert.' end, '/history');
  end if;
  return new;
end;
$$;

-- Public cards and leaderboards are ranked-only. Private duel records remain
-- visible only to their own participants in the personal history.
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
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

revoke all on function public.heartbeat_user_presence() from public;
revoke all on function public.search_friend_candidates(text) from public;
revoke all on function public.send_friend_request(uuid) from public;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
revoke all on function public.remove_friend(uuid) from public;
revoke all on function public.list_my_friends() from public;
revoke all on function public.list_my_friend_requests() from public;
revoke all on function public.create_friend_challenge(uuid, text, integer) from public;
revoke all on function public.list_my_friend_challenges() from public;
revoke all on function public.respond_to_friend_challenge(uuid, boolean) from public;
revoke all on function public.cancel_friend_challenge(uuid) from public;

grant execute on function public.heartbeat_user_presence() to authenticated;
grant execute on function public.search_friend_candidates(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_my_friends() to authenticated;
grant execute on function public.list_my_friend_requests() to authenticated;
grant execute on function public.create_friend_challenge(uuid, text, integer) to authenticated;
grant execute on function public.list_my_friend_challenges() to authenticated;
grant execute on function public.respond_to_friend_challenge(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_challenge(uuid) to authenticated;

grant execute on function public.get_public_player_statistics(uuid[]) to anon, authenticated;
grant execute on function public.get_public_player_match_history(uuid, integer) to anon, authenticated;

comment on table public.friendships is 'Private friendship graph. Access is available only through scoped RPC functions.';
comment on table public.user_presence is 'Short lived online activity for accepted friends; considered offline after two minutes.';
comment on table public.friend_challenges is 'Five-minute direct private match challenges between accepted friends.';
