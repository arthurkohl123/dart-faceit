-- RankedDarts Duo Ranked (DartCounter 2vs2)
--
-- Duo is deliberately independent from the existing 1vs1 rating and queue.
-- Every player owns an individual duo rating; a party is only a temporary
-- lobby and never a permanent shared rating.

create table if not exists public.duo_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  elo integer not null default 1000 check (elo between 0 and 10000),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= games_played),
  updated_at timestamptz not null default now()
);

create table if not exists public.duo_parties (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (leader_id <> invited_user_id)
);

create unique index if not exists duo_parties_open_leader_idx
  on public.duo_parties(leader_id);
create unique index if not exists duo_parties_open_invitee_idx
  on public.duo_parties(invited_user_id);

create table if not exists public.duo_queue_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  teammate_id uuid references auth.users(id) on delete cascade,
  party_id uuid references public.duo_parties(id) on delete cascade,
  queue_kind text not null check (queue_kind in ('solo', 'party')),
  app text not null default 'dartcounter' check (app = 'dartcounter'),
  team_elo integer not null check (team_elo between 0 and 10000),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  check ((queue_kind = 'solo' and teammate_id is null and party_id is null)
      or (queue_kind = 'party' and teammate_id is not null and party_id is not null))
);

create unique index if not exists duo_queue_owner_idx on public.duo_queue_entries(owner_id);
create index if not exists duo_queue_search_idx
  on public.duo_queue_entries(app, queue_kind, team_elo, joined_at);
create index if not exists duo_queue_heartbeat_idx
  on public.duo_queue_entries(last_seen);

create table if not exists public.duo_matches (
  id uuid primary key default gen_random_uuid(),
  app text not null default 'dartcounter' check (app = 'dartcounter'),
  status text not null default 'pending_accept'
    check (status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed')),
  team1_player1_id uuid not null references auth.users(id) on delete restrict,
  team1_player2_id uuid not null references auth.users(id) on delete restrict,
  team2_player1_id uuid not null references auth.users(id) on delete restrict,
  team2_player2_id uuid not null references auth.users(id) on delete restrict,
  team1_player1_username text not null,
  team1_player2_username text not null,
  team2_player1_username text not null,
  team2_player2_username text not null,
  team1_elo integer not null check (team1_elo between 0 and 10000),
  team2_elo integer not null check (team2_elo between 0 and 10000),
  team1_player1_accepted boolean not null default false,
  team1_player2_accepted boolean not null default false,
  team2_player1_accepted boolean not null default false,
  team2_player2_accepted boolean not null default false,
  accept_deadline timestamptz not null default (now() + interval '30 seconds'),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_winner_team smallint check (submitted_winner_team in (1, 2)),
  submitted_team1_legs integer check (submitted_team1_legs between 0 and 11),
  submitted_team2_legs integer check (submitted_team2_legs between 0 and 11),
  confirmed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team1_player1_id <> team1_player2_id
     and team1_player1_id <> team2_player1_id
     and team1_player1_id <> team2_player2_id
     and team1_player2_id <> team2_player1_id
     and team1_player2_id <> team2_player2_id
     and team2_player1_id <> team2_player2_id)
);

create index if not exists duo_matches_open_team1_idx
  on public.duo_matches(team1_player1_id, team1_player2_id, status)
  where status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed');
create index if not exists duo_matches_open_team2_idx
  on public.duo_matches(team2_player1_id, team2_player2_id, status)
  where status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed');

create table if not exists public.duo_match_history (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.duo_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  teammate_id uuid not null references auth.users(id) on delete restrict,
  opponent_one_id uuid not null references auth.users(id) on delete restrict,
  opponent_two_id uuid not null references auth.users(id) on delete restrict,
  is_win boolean not null,
  elo_change integer not null,
  score text not null,
  completed_at timestamptz not null default now(),
  unique(match_id, user_id)
);

create index if not exists duo_history_user_completed_idx
  on public.duo_match_history(user_id, completed_at desc);

alter table public.duo_ratings enable row level security;
alter table public.duo_parties enable row level security;
alter table public.duo_queue_entries enable row level security;
alter table public.duo_matches enable row level security;
alter table public.duo_match_history enable row level security;

revoke all on public.duo_ratings, public.duo_parties, public.duo_queue_entries,
  public.duo_matches, public.duo_match_history from anon, authenticated;

create or replace function public.duo_profile(p_user_id uuid)
returns table(username text, dartcounter_username text, is_banned boolean, queue_banned_until timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select p.username, p.dartcounter_username, coalesce(p.is_banned, false), p.queue_banned_until
  from public.profiles p
  where p."supabaseId" = p_user_id::text
  limit 1;
$$;

create or replace function public.duo_ensure_rating(p_user_id uuid)
returns public.duo_ratings
language plpgsql
security definer
set search_path = public
as $$
declare v_rating public.duo_ratings%rowtype;
begin
  insert into public.duo_ratings(user_id) values (p_user_id)
  on conflict (user_id) do update set updated_at = public.duo_ratings.updated_at
  returning * into v_rating;
  return v_rating;
end;
$$;

create or replace function public.duo_is_member(p_match public.duo_matches, p_user_id uuid)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_user_id in (p_match.team1_player1_id, p_match.team1_player2_id, p_match.team2_player1_id, p_match.team2_player2_id);
$$;

create or replace function public.duo_team_for_user(p_match public.duo_matches, p_user_id uuid)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
    when p_user_id in (p_match.team1_player1_id, p_match.team1_player2_id) then 1
    when p_user_id in (p_match.team2_player1_id, p_match.team2_player2_id) then 2
    else null
  end;
$$;

create or replace function public.duo_assert_player_available(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_profile record;
begin
  select * into v_profile from public.duo_profile(p_user_id);
  if not found or v_profile.is_banned then raise exception 'ACCOUNT_BANNED_OR_PROFILE_MISSING'; end if;
  if nullif(trim(v_profile.dartcounter_username), '') is null then raise exception 'DARTCOUNTER_USERNAME_REQUIRED'; end if;
  if v_profile.queue_banned_until is not null and v_profile.queue_banned_until > now() then raise exception 'QUEUE_BANNED'; end if;
  if exists (
    select 1 from public.matchmaking_queue q
    where q.user_id = p_user_id
      and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
  ) then raise exception 'ACTIVE_1V1_QUEUE_EXISTS'; end if;
  if exists (
    select 1 from public.active_matches m
    where p_user_id in (m.player1_id, m.player2_id)
      and m.status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_1V1_MATCH_EXISTS'; end if;
  if exists (
    select 1 from public.duo_matches m
    where public.duo_is_member(m, p_user_id)
      and m.status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_DUO_MATCH_EXISTS'; end if;
end;
$$;

-- Prevent a 1vs1 queue poll from giving somebody a second simultaneous search.
create or replace function public.guard_standard_queue_against_duo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.duo_queue_entries q where new.user_id in (q.owner_id, q.teammate_id))
     or exists (
       select 1 from public.duo_matches m
       where public.duo_is_member(m, new.user_id)
         and m.status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
     ) then
    raise exception 'ACTIVE_DUO_QUEUE_OR_MATCH_EXISTS';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_standard_queue_against_duo_trigger on public.matchmaking_queue;
create trigger guard_standard_queue_against_duo_trigger
before insert or update of user_id on public.matchmaking_queue
for each row execute function public.guard_standard_queue_against_duo();

create or replace function public.duo_get_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rating public.duo_ratings%rowtype;
  v_party jsonb;
  v_queue jsonb;
  v_match jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_rating := public.duo_ensure_rating(v_uid);

  select jsonb_build_object(
    'id', d.id, 'leader_id', d.leader_id, 'leader_username', lp.username,
    'invited_user_id', d.invited_user_id, 'invited_username', ip.username,
    'status', d.status, 'created_at', d.created_at
  ) into v_party
  from public.duo_parties d
  join public.profiles lp on lp."supabaseId" = d.leader_id::text
  join public.profiles ip on ip."supabaseId" = d.invited_user_id::text
  where v_uid in (d.leader_id, d.invited_user_id)
  order by d.created_at desc limit 1;

  select jsonb_build_object(
    'id', q.id, 'queue_kind', q.queue_kind, 'team_elo', q.team_elo,
    'joined_at', q.joined_at, 'last_seen', q.last_seen
  ) into v_queue
  from public.duo_queue_entries q
  where v_uid in (q.owner_id, q.teammate_id)
  limit 1;

  select jsonb_build_object(
    'id', m.id, 'status', m.status, 'app', m.app, 'accept_deadline', m.accept_deadline,
    'team1', jsonb_build_object('players', jsonb_build_array(
      jsonb_build_object('id',m.team1_player1_id,'username',m.team1_player1_username,'accepted',m.team1_player1_accepted),
      jsonb_build_object('id',m.team1_player2_id,'username',m.team1_player2_username,'accepted',m.team1_player2_accepted)
    ), 'elo',m.team1_elo),
    'team2', jsonb_build_object('players', jsonb_build_array(
      jsonb_build_object('id',m.team2_player1_id,'username',m.team2_player1_username,'accepted',m.team2_player1_accepted),
      jsonb_build_object('id',m.team2_player2_id,'username',m.team2_player2_username,'accepted',m.team2_player2_accepted)
    ), 'elo',m.team2_elo),
    'submitted_by',m.submitted_by,'submitted_winner_team',m.submitted_winner_team,
    'submitted_team1_legs',m.submitted_team1_legs,'submitted_team2_legs',m.submitted_team2_legs
  ) into v_match
  from public.duo_matches m
  where public.duo_is_member(m, v_uid)
    and m.status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  order by m.created_at desc limit 1;

  return jsonb_build_object('rating', jsonb_build_object('elo',v_rating.elo,'games_played',v_rating.games_played,'wins',v_rating.wins),
    'party',v_party,'queue',v_queue,'match',v_match);
end;
$$;

create or replace function public.duo_create_party(p_invited_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid(); v_target uuid; v_party uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public.duo_assert_player_available(v_uid);
  select p."supabaseId"::uuid into v_target from public.profiles p
  where lower(p.username)=lower(trim(p_invited_username)) and coalesce(p.is_banned,false)=false limit 1;
  if v_target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_target=v_uid then raise exception 'CANNOT_INVITE_SELF'; end if;
  perform public.duo_assert_player_available(v_target);
  perform pg_advisory_xact_lock(hashtext('rankeddarts.duo.party.' || least(v_uid::text,v_target::text)));
  if exists(select 1 from public.duo_parties where v_uid in (leader_id,invited_user_id) or v_target in (leader_id,invited_user_id)) then
    raise exception 'PARTY_ALREADY_EXISTS';
  end if;
  insert into public.duo_parties(leader_id,invited_user_id) values(v_uid,v_target) returning id into v_party;
  return jsonb_build_object('status','invited','party_id',v_party);
end;
$$;

create or replace function public.duo_respond_party_invite(p_party_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid(); v_party public.duo_parties%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_party from public.duo_parties where id=p_party_id for update;
  if not found then raise exception 'PARTY_NOT_FOUND'; end if;
  if v_party.invited_user_id<>v_uid then raise exception 'ONLY_INVITED_PLAYER_CAN_RESPOND'; end if;
  if p_accept then
    perform public.duo_assert_player_available(v_uid);
    update public.duo_parties set status='ready',updated_at=now() where id=p_party_id;
    return jsonb_build_object('status','ready');
  end if;
  delete from public.duo_parties where id=p_party_id;
  return jsonb_build_object('status','declined');
end;
$$;

create or replace function public.duo_leave_party()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.duo_queue_entries where v_uid in (owner_id,teammate_id);
  delete from public.duo_parties where v_uid in (leader_id,invited_user_id);
  return jsonb_build_object('status','left');
end;
$$;

create or replace function public.duo_cancel_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.duo_queue_entries where v_uid in (owner_id,teammate_id);
  return jsonb_build_object('status','cancelled');
end;
$$;

create or replace function public.duo_join_queue(p_max_elo_diff integer, p_queue_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid(); v_member_one uuid; v_member_two uuid; v_owner uuid;
  v_party public.duo_parties%rowtype; v_rating_one public.duo_ratings%rowtype; v_rating_two public.duo_ratings%rowtype;
  v_team_elo integer; v_candidate public.duo_queue_entries%rowtype; v_extra uuid[]; v_match_id uuid;
  v_name_one text; v_name_two text; v_name_three text; v_name_four text; v_rating_three public.duo_ratings%rowtype; v_rating_four public.duo_ratings%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_max_elo_diff not between 25 and 500 then raise exception 'INVALID_ELO_RANGE'; end if;
  if p_queue_kind not in ('solo','party') then raise exception 'INVALID_DUO_QUEUE_KIND'; end if;
  perform public.duo_assert_player_available(v_uid);
  delete from public.duo_queue_entries where last_seen < now()-interval '45 seconds';
  perform pg_advisory_xact_lock(hashtext('rankeddarts.duo.queue.' || v_uid::text));

  if p_queue_kind='party' then
    select * into v_party from public.duo_parties where v_uid in (leader_id,invited_user_id) and status='ready' for update;
    if not found then raise exception 'READY_PARTY_REQUIRED'; end if;
    v_member_one:=v_party.leader_id; v_member_two:=v_party.invited_user_id; v_owner:=v_party.leader_id;
    perform public.duo_assert_player_available(v_member_one); perform public.duo_assert_player_available(v_member_two);
  else
    if exists(select 1 from public.duo_parties where v_uid in (leader_id,invited_user_id)) then raise exception 'LEAVE_PARTY_FOR_SOLO_QUEUE'; end if;
    v_member_one:=v_uid; v_member_two:=null; v_owner:=v_uid;
  end if;

  v_rating_one:=public.duo_ensure_rating(v_member_one);
  if v_member_two is not null then v_rating_two:=public.duo_ensure_rating(v_member_two); v_team_elo:=round((v_rating_one.elo+v_rating_two.elo)/2.0); else v_team_elo:=v_rating_one.elo; end if;
  select username into v_name_one from public.duo_profile(v_member_one);
  if v_member_two is not null then select username into v_name_two from public.duo_profile(v_member_two); end if;

  delete from public.duo_queue_entries where v_uid in (owner_id,teammate_id) and owner_id<>v_owner;
  insert into public.duo_queue_entries(owner_id,teammate_id,party_id,queue_kind,team_elo,last_seen)
  values(v_owner,v_member_two,case when p_queue_kind='party' then v_party.id else null end,p_queue_kind,v_team_elo,now())
  on conflict(owner_id) do update set team_elo=excluded.team_elo,last_seen=excluded.last_seen;

  if p_queue_kind='party' then
    select * into v_candidate from public.duo_queue_entries q
    where q.owner_id<>v_owner and q.queue_kind='party' and q.app='dartcounter'
      and q.last_seen>=now()-interval '45 seconds' and abs(q.team_elo-v_team_elo)<=p_max_elo_diff
    order by abs(q.team_elo-v_team_elo),q.joined_at for update skip locked limit 1;
    if found then
      select username into v_name_three from public.duo_profile(v_candidate.owner_id);
      select username into v_name_four from public.duo_profile(v_candidate.teammate_id);
      insert into public.duo_matches(team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,team1_player1_username,team1_player2_username,team2_player1_username,team2_player2_username,team1_elo,team2_elo)
      values(v_member_one,v_member_two,v_candidate.owner_id,v_candidate.teammate_id,v_name_one,v_name_two,v_name_three,v_name_four,v_team_elo,v_candidate.team_elo) returning id into v_match_id;
      delete from public.duo_queue_entries where owner_id in(v_owner,v_candidate.owner_id);
      return jsonb_build_object('status','matched','match_id',v_match_id);
    end if;
  else
    select array_agg(q.owner_id order by abs(q.team_elo-v_team_elo),q.joined_at) into v_extra
    from (select q.* from public.duo_queue_entries q where q.owner_id<>v_owner and q.queue_kind='solo' and q.app='dartcounter' and q.last_seen>=now()-interval '45 seconds' and abs(q.team_elo-v_team_elo)<=p_max_elo_diff order by abs(q.team_elo-v_team_elo),q.joined_at for update skip locked limit 3) q;
    if coalesce(array_length(v_extra,1),0)=3 then
      select username into v_name_two from public.duo_profile(v_extra[1]); select username into v_name_three from public.duo_profile(v_extra[2]); select username into v_name_four from public.duo_profile(v_extra[3]);
      v_rating_two:=public.duo_ensure_rating(v_extra[1]); v_rating_three:=public.duo_ensure_rating(v_extra[2]); v_rating_four:=public.duo_ensure_rating(v_extra[3]);
      insert into public.duo_matches(team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,team1_player1_username,team1_player2_username,team2_player1_username,team2_player2_username,team1_elo,team2_elo)
      values(v_member_one,v_extra[1],v_extra[2],v_extra[3],v_name_one,v_name_two,v_name_three,v_name_four,round((v_rating_one.elo+v_rating_two.elo)/2.0),round((v_rating_three.elo+v_rating_four.elo)/2.0)) returning id into v_match_id;
      delete from public.duo_queue_entries where owner_id=any(array[v_owner,v_extra[1],v_extra[2],v_extra[3]]);
      return jsonb_build_object('status','matched','match_id',v_match_id);
    end if;
  end if;
  return jsonb_build_object('status','searching','queue_kind',p_queue_kind,'team_elo',v_team_elo);
end;
$$;

create or replace function public.duo_accept_match(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_match public.duo_matches%rowtype; v_all boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.duo_matches where id=p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.duo_is_member(v_match,v_uid) then raise exception 'MATCH_ACCESS_DENIED'; end if;
  if v_match.status<>'pending_accept' then return jsonb_build_object('status',v_match.status); end if;
  if v_match.accept_deadline<=now() then update public.duo_matches set status='cancelled',updated_at=now() where id=p_match_id; return jsonb_build_object('status','expired'); end if;
  update public.duo_matches set team1_player1_accepted=case when team1_player1_id=v_uid then true else team1_player1_accepted end,team1_player2_accepted=case when team1_player2_id=v_uid then true else team1_player2_accepted end,team2_player1_accepted=case when team2_player1_id=v_uid then true else team2_player1_accepted end,team2_player2_accepted=case when team2_player2_id=v_uid then true else team2_player2_accepted end,updated_at=now() where id=p_match_id returning * into v_match;
  v_all:=v_match.team1_player1_accepted and v_match.team1_player2_accepted and v_match.team2_player1_accepted and v_match.team2_player2_accepted;
  if v_all then update public.duo_matches set status='pending_result',updated_at=now() where id=p_match_id; return jsonb_build_object('status','ready'); end if;
  return jsonb_build_object('status','waiting');
end;
$$;

create or replace function public.duo_decline_match(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_match public.duo_matches%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.duo_matches where id=p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.duo_is_member(v_match,v_uid) then raise exception 'MATCH_ACCESS_DENIED'; end if;
  if v_match.status='pending_accept' then update public.duo_matches set status='cancelled',updated_at=now() where id=p_match_id; end if;
  return jsonb_build_object('status','cancelled');
end;
$$;

create or replace function public.duo_submit_result(p_match_id uuid,p_my_legs integer,p_opponent_legs integer)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_match public.duo_matches%rowtype; v_team smallint; v_winner smallint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.duo_matches where id=p_match_id for update;
  if not found or not public.duo_is_member(v_match,v_uid) then raise exception 'MATCH_ACCESS_DENIED'; end if;
  if v_match.status<>'pending_result' then raise exception 'MATCH_NOT_PENDING_RESULT'; end if;
  if not ((p_my_legs=4 and p_opponent_legs between 0 and 3) or (p_opponent_legs=4 and p_my_legs between 0 and 3)) then raise exception 'INVALID_MATCH_SCORE'; end if;
  v_team:=public.duo_team_for_user(v_match,v_uid); v_winner:=case when p_my_legs>p_opponent_legs then v_team else case when v_team=1 then 2 else 1 end end;
  update public.duo_matches set status='awaiting_confirmation',submitted_by=v_uid,submitted_winner_team=v_winner,submitted_team1_legs=case when v_team=1 then p_my_legs else p_opponent_legs end,submitted_team2_legs=case when v_team=2 then p_my_legs else p_opponent_legs end,updated_at=now() where id=p_match_id;
  return jsonb_build_object('status','awaiting_confirmation');
end;
$$;

create or replace function public.duo_confirm_result(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_match public.duo_matches%rowtype; v_submitter_team smallint; v_confirm_team smallint; v_change integer; v_winner_one boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.duo_matches where id=p_match_id for update;
  if not found or not public.duo_is_member(v_match,v_uid) then raise exception 'MATCH_ACCESS_DENIED'; end if;
  if v_match.status<>'awaiting_confirmation' then raise exception 'MATCH_NOT_AWAITING_CONFIRMATION'; end if;
  v_submitter_team:=public.duo_team_for_user(v_match,v_match.submitted_by); v_confirm_team:=public.duo_team_for_user(v_match,v_uid);
  if v_confirm_team=v_submitter_team then raise exception 'OPPOSING_TEAM_CONFIRMATION_REQUIRED'; end if;
  v_change:=greatest(1,least(50,public.calculate_elo_change(case when v_match.submitted_winner_team=1 then v_match.team1_elo else v_match.team2_elo end,case when v_match.submitted_winner_team=1 then v_match.team2_elo else v_match.team1_elo end)));
  v_winner_one:=v_match.submitted_winner_team=1;
  insert into public.duo_ratings(user_id) values(v_match.team1_player1_id),(v_match.team1_player2_id),(v_match.team2_player1_id),(v_match.team2_player2_id) on conflict(user_id) do nothing;
  update public.duo_ratings set elo=greatest(0,elo+case when v_winner_one then v_change else -v_change end),games_played=games_played+1,wins=wins+case when v_winner_one then 1 else 0 end,updated_at=now() where user_id in(v_match.team1_player1_id,v_match.team1_player2_id);
  update public.duo_ratings set elo=greatest(0,elo+case when v_winner_one then -v_change else v_change end),games_played=games_played+1,wins=wins+case when v_winner_one then 0 else 1 end,updated_at=now() where user_id in(v_match.team2_player1_id,v_match.team2_player2_id);
  insert into public.duo_match_history(match_id,user_id,teammate_id,opponent_one_id,opponent_two_id,is_win,elo_change,score) values
    (p_match_id,v_match.team1_player1_id,v_match.team1_player2_id,v_match.team2_player1_id,v_match.team2_player2_id,v_winner_one,case when v_winner_one then v_change else -v_change end,v_match.submitted_team1_legs::text||':'||v_match.submitted_team2_legs::text),
    (p_match_id,v_match.team1_player2_id,v_match.team1_player1_id,v_match.team2_player1_id,v_match.team2_player2_id,v_winner_one,case when v_winner_one then v_change else -v_change end,v_match.submitted_team1_legs::text||':'||v_match.submitted_team2_legs::text),
    (p_match_id,v_match.team2_player1_id,v_match.team2_player2_id,v_match.team1_player1_id,v_match.team1_player2_id,not v_winner_one,case when v_winner_one then -v_change else v_change end,v_match.submitted_team2_legs::text||':'||v_match.submitted_team1_legs::text),
    (p_match_id,v_match.team2_player2_id,v_match.team2_player1_id,v_match.team1_player1_id,v_match.team1_player2_id,not v_winner_one,case when v_winner_one then -v_change else v_change end,v_match.submitted_team2_legs::text||':'||v_match.submitted_team1_legs::text);
  update public.duo_matches set status='completed',confirmed_by=v_uid,completed_at=now(),updated_at=now() where id=p_match_id;
  return jsonb_build_object('status','completed','elo_change',v_change,'winner_team',v_match.submitted_winner_team);
end;
$$;

create or replace function public.duo_get_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, elo integer, games_played integer, wins integer, winrate numeric)
language sql security definer set search_path=public stable as $$
  select row_number() over(order by r.elo desc,r.wins desc,r.games_played desc,p.username),p.username,r.elo,r.games_played,r.wins,
    case when r.games_played=0 then 0 else round((r.wins::numeric/r.games_played)*100,1) end
  from public.duo_ratings r join public.profiles p on p."supabaseId"=r.user_id::text
  where coalesce(p.is_banned,false)=false and coalesce(p.is_publicly_visible,true)=true
  order by r.elo desc,r.wins desc,r.games_played desc,p.username limit greatest(1,least(p_limit,200));
$$;

revoke all on function public.duo_profile(uuid),public.duo_ensure_rating(uuid),public.duo_is_member(public.duo_matches,uuid),public.duo_team_for_user(public.duo_matches,uuid),public.duo_assert_player_available(uuid),public.guard_standard_queue_against_duo(),public.duo_get_state(),public.duo_create_party(text),public.duo_respond_party_invite(uuid,boolean),public.duo_leave_party(),public.duo_cancel_queue(),public.duo_join_queue(integer,text),public.duo_accept_match(uuid),public.duo_decline_match(uuid),public.duo_submit_result(uuid,integer,integer),public.duo_confirm_result(uuid),public.duo_get_leaderboard(integer) from public;
grant execute on function public.duo_get_state(),public.duo_create_party(text),public.duo_respond_party_invite(uuid,boolean),public.duo_leave_party(),public.duo_cancel_queue(),public.duo_join_queue(integer,text),public.duo_accept_match(uuid),public.duo_decline_match(uuid),public.duo_submit_result(uuid,integer,integer),public.duo_confirm_result(uuid),public.duo_get_leaderboard(integer) to authenticated;
