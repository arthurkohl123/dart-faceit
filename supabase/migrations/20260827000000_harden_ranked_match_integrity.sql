-- Ranked match integrity and least-privilege hardening.
-- This migration removes legacy RPC overloads, makes Elo finalization idempotent,
-- closes broad write policies and records every sensitive match transition.

alter table public.matches
  add column if not exists active_match_id uuid references public.active_matches(id) on delete set null;

create unique index if not exists matches_active_match_user_key
  on public.matches(active_match_id, user_id)
  where active_match_id is not null;

create index if not exists active_matches_open_players_idx
  on public.active_matches(player1_id, player2_id, status)
  where status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed');

create index if not exists matchmaking_queue_match_idx
  on public.matchmaking_queue(app, elo, joined_at);

create table if not exists public.match_audit_log (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.active_matches(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 60),
  old_status text,
  new_status text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_audit_log_match_idx
  on public.match_audit_log(match_id, created_at desc);

create table if not exists public.match_integrity_flags (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.active_matches(id) on delete set null,
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  context jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists match_integrity_flags_match_reason_key
  on public.match_integrity_flags(match_id, reason)
  where match_id is not null;

alter table public.match_audit_log enable row level security;
alter table public.match_integrity_flags enable row level security;
revoke all on public.match_audit_log, public.match_integrity_flags from anon, authenticated;

-- Remove legacy policies that let browser clients write arbitrary match data.
drop policy if exists "RPCs can manage active matches" on public.active_matches;
drop policy if exists "RPCs can insert matches" on public.matches;
drop policy if exists "Matches history is viewable by everyone" on public.matches;
drop policy if exists "Anyone can see queue" on public.matchmaking_queue;
drop policy if exists "Jeder darf lesen" on public.matchmaking_queue;
drop policy if exists "Users can manage their own queue entry" on public.matchmaking_queue;
drop policy if exists "User darf sich eintragen" on public.matchmaking_queue;
drop policy if exists "User darf sich löschen" on public.matchmaking_queue;
drop policy if exists "User darf eigenen Eintrag aktualisieren" on public.matchmaking_queue;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

revoke insert, update, delete on public.active_matches from anon, authenticated;
revoke insert, update, delete on public.matches from anon, authenticated;
revoke insert, update, delete on public.matchmaking_queue from anon, authenticated;

drop policy if exists "Users can view own match history" on public.matches;
create policy "Users can view own match history"
  on public.matches for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view own queue entry" on public.matchmaking_queue;
create policy "Users can view own queue entry"
  on public.matchmaking_queue for select to authenticated
  using (auth.uid() = user_id);

-- A user-created profile can never bootstrap privileged or paid fields.
create or replace function public.guard_profile_self_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sms_verification_enabled boolean;
begin
  if auth.role() = 'authenticated' then
    if new."supabaseId" <> auth.uid()::text then
      raise exception 'PROFILE_OWNER_MISMATCH';
    end if;
    new.elo := 1000;
    new."gamesPlayed" := 0;
    new.wins := 0;
    new."isPremium" := false;
    new.is_admin := false;
    new.is_moderator := false;
    new.is_developer := false;
    new.is_banned := false;
    select coalesce((value ->> 'enabled')::boolean, true)
      into v_sms_verification_enabled
      from public.app_settings
      where key = 'sms_verification';
    new.phone_verified := not coalesce(v_sms_verification_enabled, true);
    new.phone_verified_at := case when new.phone_verified then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_self_insert_trigger on public.profiles;
create trigger guard_profile_self_insert_trigger
before insert on public.profiles
for each row execute function public.guard_profile_self_insert();

create or replace function public.complete_my_phone_verification(p_phone_number text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_phone text;
  v_confirmed timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_phone_number is null or p_phone_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_PHONE_NUMBER';
  end if;

  select phone, phone_confirmed_at into v_auth_phone, v_confirmed
  from auth.users where id = v_uid;

  if v_confirmed is null or v_auth_phone is distinct from p_phone_number then
    raise exception 'PHONE_NOT_VERIFIED_BY_AUTH';
  end if;

  update public.profiles
  set phone_number = p_phone_number,
      phone_verified = true,
      phone_verified_at = coalesce(phone_verified_at, now())
  where "supabaseId" = v_uid::text;
end;
$$;

revoke all on function public.complete_my_phone_verification(text) from public;
grant execute on function public.complete_my_phone_verification(text) to authenticated;

create or replace function public.get_matchmaking_queue_counts()
returns table(app text, player_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select q.app, count(*)::bigint
  from public.matchmaking_queue q
  where q.last_seen is null or q.last_seen >= now() - interval '45 seconds'
  group by q.app;
$$;

revoke all on function public.get_matchmaking_queue_counts() from public;
grant execute on function public.get_matchmaking_queue_counts() to authenticated;

-- The obsolete overload accepted incomplete statistics and fixed no score format.
drop function if exists public.submit_match_result(uuid, integer, integer, numeric, integer, integer);

create or replace function public.submit_match_result(
  p_match_id uuid,
  p_my_legs integer,
  p_opponent_legs integer,
  p_my_average double precision default null,
  p_opponent_average double precision default null,
  p_highest_checkout integer default null,
  p_my_180s integer default 0,
  p_opponent_180s integer default 0
)
returns table(result_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
  v_i_am_player1 boolean;
  v_winner_id uuid;
  v_best_of integer;
  v_legs_to_win integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_match
  from public.active_matches
  where id = p_match_id
    and (player1_id = v_uid or player2_id = v_uid)
  for update;

  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_match.player1_id = v_match.player2_id then raise exception 'INVALID_MATCH_PLAYERS'; end if;
  if v_match.status <> 'pending_result' then raise exception 'MATCH_NOT_PENDING_RESULT'; end if;

  v_best_of := coalesce(v_match.best_of, 7);
  if v_best_of < 1 or mod(v_best_of, 2) = 0 or v_best_of > 21 then
    raise exception 'INVALID_MATCH_FORMAT';
  end if;
  v_legs_to_win := (v_best_of / 2) + 1;

  if not (
    (p_my_legs = v_legs_to_win and p_opponent_legs between 0 and v_legs_to_win - 1)
    or (p_opponent_legs = v_legs_to_win and p_my_legs between 0 and v_legs_to_win - 1)
  ) then raise exception 'INVALID_MATCH_SCORE'; end if;

  if p_my_average is null or p_my_average < 0 or p_my_average > 180
     or p_opponent_average is null or p_opponent_average < 0 or p_opponent_average > 180 then
    raise exception 'INVALID_MATCH_AVERAGES';
  end if;
  if coalesce(p_my_180s, 0) not between 0 and 100
     or coalesce(p_opponent_180s, 0) not between 0 and 100 then
    raise exception 'INVALID_180S';
  end if;
  if p_highest_checkout is not null and p_highest_checkout not between 0 and 170 then
    raise exception 'INVALID_CHECKOUT';
  end if;

  v_i_am_player1 := v_uid = v_match.player1_id;
  v_winner_id := case when p_my_legs > p_opponent_legs then v_uid
    when v_i_am_player1 then v_match.player2_id else v_match.player1_id end;

  update public.active_matches set
    status = 'awaiting_confirmation',
    submitted_by = v_uid,
    submitted_winner_id = v_winner_id,
    submitted_player1_legs = case when v_i_am_player1 then p_my_legs else p_opponent_legs end,
    submitted_player2_legs = case when v_i_am_player1 then p_opponent_legs else p_my_legs end,
    submitted_player1_average = case when v_i_am_player1 then p_my_average else p_opponent_average end,
    submitted_player2_average = case when v_i_am_player1 then p_opponent_average else p_my_average end,
    submitted_player1_180s = case when v_i_am_player1 then coalesce(p_my_180s,0) else coalesce(p_opponent_180s,0) end,
    submitted_player2_180s = case when v_i_am_player1 then coalesce(p_opponent_180s,0) else coalesce(p_my_180s,0) end,
    submitted_player1_checkout = case when v_i_am_player1 then p_highest_checkout else null end,
    submitted_player2_checkout = case when v_i_am_player1 then null else p_highest_checkout end,
    confirmation_requested_at = now(),
    dispute_reason = null,
    dispute_screenshot_url = null,
    updated_at = now()
  where id = p_match_id;

  return query select 'awaiting_confirmation'::text,
    'Ergebnis und Statistiken wurden eingereicht. Warte auf Bestätigung.'::text;
end;
$$;

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
  v_elo_change integer;
  v_p1_change integer;
  v_p2_change integer;
  v_rows integer;
begin
  select * into v_match from public.active_matches
  where id = p_match_id and status = 'awaiting_confirmation'
  for update;
  if not found then raise exception 'MATCH_NOT_AWAITING_CONFIRMATION'; end if;
  if v_match.submitted_winner_id not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'INVALID_SUBMITTED_WINNER';
  end if;
  if v_match.player1_id = v_match.player2_id then raise exception 'INVALID_MATCH_PLAYERS'; end if;

  if exists (select 1 from public.matches where active_match_id = p_match_id) then
    raise exception 'MATCH_ALREADY_RATED';
  end if;

  v_winner_id := v_match.submitted_winner_id;
  if v_winner_id = v_match.player1_id then
    v_loser_id := v_match.player2_id; v_winner_elo := v_match.player1_elo; v_loser_elo := v_match.player2_elo;
  else
    v_loser_id := v_match.player1_id; v_winner_elo := v_match.player2_elo; v_loser_elo := v_match.player1_elo;
  end if;
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

  insert into public.matches(active_match_id,user_id,opponent_id,opponent_name,opponent_elo,
    legs_won,legs_lost,result,is_win,my_average,highest_checkout,one_eighties,elo_change,status)
  values
    (p_match_id,v_match.player1_id,v_match.player2_id,v_match.player2_username,v_match.player2_elo,
      coalesce(v_match.submitted_player1_legs,0),coalesce(v_match.submitted_player2_legs,0),
      coalesce(v_match.submitted_player1_legs,0)::text||':'||coalesce(v_match.submitted_player2_legs,0)::text,
      v_winner_id=v_match.player1_id,v_match.submitted_player1_average,v_match.submitted_player1_checkout,
      coalesce(v_match.submitted_player1_180s,0),v_p1_change,'completed'),
    (p_match_id,v_match.player2_id,v_match.player1_id,v_match.player1_username,v_match.player1_elo,
      coalesce(v_match.submitted_player2_legs,0),coalesce(v_match.submitted_player1_legs,0),
      coalesce(v_match.submitted_player2_legs,0)::text||':'||coalesce(v_match.submitted_player1_legs,0)::text,
      v_winner_id=v_match.player2_id,v_match.submitted_player2_average,v_match.submitted_player2_checkout,
      coalesce(v_match.submitted_player2_180s,0),v_p2_change,'completed');

  update public.active_matches set status='completed', confirmed_by=p_confirmed_by,
    completed_at=now(), updated_at=now() where id=p_match_id;

  insert into public.match_audit_log(match_id,actor_id,action,old_status,new_status,context)
  values(p_match_id,p_confirmed_by,'elo_finalized','awaiting_confirmation','completed',
    jsonb_build_object('mode',p_confirmation_mode,'winner_id',v_winner_id,'elo_change',v_elo_change));

  return jsonb_build_object('result_status','success','result_message','Match erfolgreich bestätigt.','elo_change',v_elo_change);
end;
$$;

revoke all on function public.finalize_ranked_match_result(uuid,uuid,text) from public;

create or replace function public.confirm_match_result(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_match public.active_matches%rowtype; v_result jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.active_matches where id=p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_uid not in (v_match.player1_id,v_match.player2_id) then raise exception 'NOT_MATCH_PARTICIPANT'; end if;
  if v_match.submitted_by=v_uid then raise exception 'CANNOT_CONFIRM_OWN_RESULT'; end if;
  v_result := public.finalize_ranked_match_result(p_match_id,v_uid,'opponent_confirmation');
  return v_result::json;
end;
$$;

create or replace function public.auto_confirm_match_result(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_match public.active_matches%rowtype; v_result jsonb;
begin
  select * into v_match from public.active_matches where id=p_match_id for update;
  if not found or v_match.status <> 'awaiting_confirmation' then
    return json_build_object('result_status','ignored','result_message','Match bereits verarbeitet.');
  end if;
  if v_uid is not null and v_uid not in (v_match.player1_id,v_match.player2_id) and auth.role() <> 'service_role' then
    raise exception 'NOT_MATCH_PARTICIPANT';
  end if;
  if v_uid is null and auth.role() <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_match.confirmation_requested_at > now()-interval '5 minutes' then
    return json_build_object('result_status','ignored','result_message','Timeout noch nicht abgelaufen.');
  end if;
  v_result := public.finalize_ranked_match_result(p_match_id,coalesce(v_uid,v_match.submitted_by),'timeout');
  return v_result::json;
end;
$$;

create or replace function public.check_and_join_queue(p_max_elo_diff integer,p_app text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_result json;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_app not in ('scolia','dartcounter') then raise exception 'INVALID_MATCHMAKING_PLATFORM'; end if;
  if p_max_elo_diff not between 25 and 500 then raise exception 'INVALID_ELO_RANGE'; end if;
  perform public.cleanup_cancelled_active_matches(0);
  if exists(select 1 from public.profiles where "supabaseId"=v_uid::text and is_banned=true) then
    raise exception 'ACCOUNT_BANNED';
  end if;
  if p_app='scolia' and not exists(select 1 from public.profiles where "supabaseId"=v_uid::text and nullif(trim(scolia_username),'') is not null) then
    raise exception 'SCOLIA_USERNAME_REQUIRED';
  end if;
  if p_app='dartcounter' and not exists(select 1 from public.profiles where "supabaseId"=v_uid::text and nullif(trim(dartcounter_username),'') is not null) then
    raise exception 'DARTCOUNTER_USERNAME_REQUIRED';
  end if;
  if exists(select 1 from public.active_matches where (player1_id=v_uid or player2_id=v_uid)
    and status in ('pending_accept','pending_result','awaiting_confirmation','disputed')) then
    raise exception 'ACTIVE_MATCH_EXISTS';
  end if;
  select public.find_or_create_match(p_max_elo_diff,p_app) into v_result;
  return v_result;
end;
$$;

create or replace function public.expire_match_accept(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_match public.active_matches%rowtype; v_uid uuid := auth.uid();
begin
  select * into v_match from public.active_matches where id=p_match_id for update;
  if not found then return json_build_object('status','error','message','Match nicht gefunden.'); end if;
  if v_uid is not null and v_uid not in (v_match.player1_id,v_match.player2_id) and auth.role()<>'service_role' then
    raise exception 'NOT_MATCH_PARTICIPANT';
  end if;
  if v_uid is null and auth.role()<>'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_match.status<>'pending_accept' then return json_build_object('status','already_handled'); end if;
  if v_match.accept_deadline is not null and now()<v_match.accept_deadline then
    return json_build_object('status','not_expired','remaining',extract(epoch from (v_match.accept_deadline-now()))::integer);
  end if;
  update public.active_matches set status='cancelled',updated_at=now() where id=p_match_id;
  if not coalesce(v_match.player1_accepted,false) then delete from public.matchmaking_queue where user_id=v_match.player1_id; end if;
  if not coalesce(v_match.player2_accepted,false) then delete from public.matchmaking_queue where user_id=v_match.player2_id; end if;
  return json_build_object('status','expired','message','Accept-Frist abgelaufen.');
end;
$$;

create or replace function public.report_no_show(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid(); v_match public.active_matches%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.active_matches where id=p_match_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_uid not in (v_match.player1_id,v_match.player2_id) then return jsonb_build_object('status','forbidden'); end if;
  if v_match.status<>'pending_result' then return jsonb_build_object('status','invalid_status'); end if;
  if v_match.created_at > now()-interval '3 minutes' then
    return jsonb_build_object('status','too_early','message','Eine No-Show-Meldung ist erst drei Minuten nach Matchstart möglich.');
  end if;
  if v_match.no_show_resolved then return jsonb_build_object('status','resolved'); end if;
  if v_match.no_show_reported_at is not null then
    return jsonb_build_object('status','already_reported','reported_by',v_match.no_show_reported_by,
      'deadline',v_match.no_show_reported_at+interval '5 minutes');
  end if;
  update public.active_matches set no_show_reported_by=v_uid,no_show_reported_at=now(),no_show_resolved=false,updated_at=now()
  where id=p_match_id;
  return jsonb_build_object('status','reported','reported_by',v_uid,'deadline',now()+interval '5 minutes');
end;
$$;

create or replace function public.resolve_no_show(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid(); v_match public.active_matches%rowtype; v_absent_player uuid;
  v_ban_minutes integer:=15; v_setting jsonb; v_ban_until timestamptz;
begin
  select * into v_match from public.active_matches where id=p_match_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_uid is not null and v_uid<>v_match.no_show_reported_by and auth.role()<>'service_role' then
    raise exception 'ONLY_REPORTER_CAN_RESOLVE_NO_SHOW';
  end if;
  if v_uid is null and auth.role()<>'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_match.no_show_resolved then return jsonb_build_object('status','already_resolved'); end if;
  if v_match.status<>'pending_result' then return jsonb_build_object('status','invalid_status'); end if;
  if v_match.no_show_reported_at is null or v_match.no_show_reported_by is null then return jsonb_build_object('status','not_reported'); end if;
  if v_match.no_show_reported_at+interval '5 minutes'>now() then
    return jsonb_build_object('status','not_expired','remaining_seconds',greatest(0,extract(epoch from (v_match.no_show_reported_at+interval '5 minutes'-now()))::integer));
  end if;
  select value into v_setting from public.app_settings where key='no_show_queue_ban_minutes';
  v_ban_minutes:=greatest(1,least(1440,coalesce((v_setting->>'minutes')::integer,15)));
  v_absent_player:=case when v_match.no_show_reported_by=v_match.player1_id then v_match.player2_id else v_match.player1_id end;
  v_ban_until:=now()+make_interval(mins=>v_ban_minutes);
  update public.profiles set queue_banned_until=greatest(coalesce(queue_banned_until,now()),v_ban_until),
    queue_ban_reason='No-Show: Match nicht rechtzeitig betreten/bestätigt',no_show_strikes=coalesce(no_show_strikes,0)+1
  where "supabaseId"=v_absent_player::text;
  update public.active_matches set status='cancelled',no_show_resolved=true,updated_at=now() where id=p_match_id;
  return jsonb_build_object('status','resolved','absent_player_id',v_absent_player,'queue_banned_until',v_ban_until,'queue_ban_minutes',v_ban_minutes);
end;
$$;

create or replace function public.dispute_match_result(p_match_id uuid,p_reason text default null,p_screenshot_url text default null)
returns table(result_status text,result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid:=auth.uid(); v_match public.active_matches%rowtype; v_reason text:=trim(coalesce(p_reason,''));
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_match from public.active_matches where id=p_match_id for update;
  if not found then return query select 'error'::text,'Match nicht gefunden'::text; return; end if;
  if v_uid not in (v_match.player1_id,v_match.player2_id) then return query select 'error'::text,'Nicht berechtigt'::text; return; end if;
  if v_match.status<>'awaiting_confirmation' or v_match.submitted_by=v_uid then
    return query select 'error'::text,'Widerspruch ist für dieses Match nicht möglich'::text; return;
  end if;
  if char_length(v_reason) not between 10 and 1500 then raise exception 'INVALID_DISPUTE_REASON'; end if;
  if p_screenshot_url is not null and (p_screenshot_url !~ '^https://' or position('/storage/v1/object/public/dispute-screenshots/' in p_screenshot_url)=0) then
    raise exception 'INVALID_DISPUTE_SCREENSHOT_URL';
  end if;
  update public.active_matches set status='disputed',dispute_reason=v_reason,dispute_screenshot_url=p_screenshot_url,updated_at=now()
  where id=p_match_id;
  return query select 'success'::text,'Widerspruch gespeichert. Ein Admin wird das Match prüfen.'::text;
end;
$$;

-- Revoke implicit PUBLIC execution and expose only the intended entry points.
revoke all on function public.find_or_create_match(integer,text) from public;
revoke all on function public.calculate_elo_change(integer,integer) from public;
revoke all on function public.submit_match_result(uuid,integer,integer,double precision,double precision,integer,integer,integer) from public;
revoke all on function public.confirm_match_result(uuid) from public;
revoke all on function public.auto_confirm_match_result(uuid) from public;
revoke all on function public.check_and_join_queue(integer,text) from public;
grant execute on function public.submit_match_result(uuid,integer,integer,double precision,double precision,integer,integer,integer) to authenticated;
grant execute on function public.confirm_match_result(uuid) to authenticated;
grant execute on function public.auto_confirm_match_result(uuid) to authenticated, service_role;
grant execute on function public.check_and_join_queue(integer,text) to authenticated;

-- Harden existing security-definer functions against object-shadowing attacks.
alter function public.accept_match(uuid) set search_path = public;
alter function public.decline_match(uuid) set search_path = public;
alter function public.dispute_match_result(uuid,text,text) set search_path = public;
alter function public.cancel_no_show(uuid) set search_path = public;

revoke all on function public.accept_match(uuid) from public;
revoke all on function public.decline_match(uuid) from public;
revoke all on function public.expire_match_accept(uuid) from public;
revoke all on function public.dispute_match_result(uuid,text,text) from public;
revoke all on function public.report_no_show(uuid) from public;
revoke all on function public.cancel_no_show(uuid) from public;
revoke all on function public.resolve_no_show(uuid) from public;
grant execute on function public.accept_match(uuid), public.decline_match(uuid), public.expire_match_accept(uuid),
  public.dispute_match_result(uuid,text,text), public.report_no_show(uuid), public.cancel_no_show(uuid),
  public.resolve_no_show(uuid) to authenticated;
