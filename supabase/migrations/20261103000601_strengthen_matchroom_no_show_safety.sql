-- A No-Show must only apply to somebody who never entered the Matchroom.
-- Once a player has opened the room, they may be playing on the selected darts
-- platform in another tab and must never lose a running game just because they
-- did not notice a browser countdown.

alter table public.active_matches
  add column if not exists player1_matchroom_entered_at timestamptz,
  add column if not exists player2_matchroom_entered_at timestamptz;

create or replace function public.mark_matchroom_entered(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
  v_withdrew_no_show boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_match
  from public.active_matches
  where id = p_match_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_uid not in (v_match.player1_id, v_match.player2_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_match.status not in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed') then
    return jsonb_build_object('status', 'inactive');
  end if;

  -- Opening the room is sufficient to prove that a player is present for the
  -- automatic No-Show workflow. If a report was already filed against this
  -- player, safely withdraw it instead of forcing them to notice a countdown.
  v_withdrew_no_show := v_match.no_show_reported_at is not null
    and coalesce(v_match.no_show_resolved, false) = false
    and v_match.no_show_reported_by is distinct from v_uid;

  update public.active_matches
  set player1_matchroom_entered_at = case
        when v_uid = v_match.player1_id then coalesce(v_match.player1_matchroom_entered_at, now())
        else v_match.player1_matchroom_entered_at
      end,
      player2_matchroom_entered_at = case
        when v_uid = v_match.player2_id then coalesce(v_match.player2_matchroom_entered_at, now())
        else v_match.player2_matchroom_entered_at
      end,
      no_show_reported_by = case when v_withdrew_no_show then null else v_match.no_show_reported_by end,
      no_show_reported_at = case when v_withdrew_no_show then null else v_match.no_show_reported_at end,
      no_show_resolved = case when v_withdrew_no_show then false else v_match.no_show_resolved end,
      updated_at = now()
  where id = p_match_id;

  return jsonb_build_object(
    'status', 'entered',
    'no_show_withdrawn', v_withdrew_no_show
  );
end;
$$;

create or replace function public.report_no_show(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
  v_opponent_entered_at timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_match
  from public.active_matches
  where id = p_match_id
  for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_uid not in (v_match.player1_id, v_match.player2_id) then return jsonb_build_object('status', 'forbidden'); end if;
  if v_match.status <> 'pending_result' then return jsonb_build_object('status', 'invalid_status'); end if;
  if v_match.created_at > now() - interval '3 minutes' then
    return jsonb_build_object('status', 'too_early', 'message', 'Eine No-Show-Meldung ist erst drei Minuten nach Matchstart möglich.');
  end if;
  if v_match.no_show_resolved then return jsonb_build_object('status', 'resolved'); end if;
  if v_match.no_show_reported_at is not null then
    return jsonb_build_object(
      'status', 'already_reported',
      'reported_by', v_match.no_show_reported_by,
      'deadline', v_match.no_show_reported_at + interval '5 minutes'
    );
  end if;

  v_opponent_entered_at := case
    when v_uid = v_match.player1_id then v_match.player2_matchroom_entered_at
    else v_match.player1_matchroom_entered_at
  end;

  if v_opponent_entered_at is not null then
    return jsonb_build_object(
      'status', 'opponent_present',
      'message', 'Dein Gegner hat den Matchroom bereits betreten. Eine automatische No-Show-Wertung ist für dieses laufende Match nicht möglich.'
    );
  end if;

  update public.active_matches
  set no_show_reported_by = v_uid,
      no_show_reported_at = now(),
      no_show_resolved = false,
      updated_at = now()
  where id = p_match_id;

  return jsonb_build_object(
    'status', 'reported',
    'reported_by', v_uid,
    'deadline', now() + interval '5 minutes'
  );
end;
$$;

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
  v_absent_player_entered_at timestamptz;
  v_ban_minutes integer := 15;
  v_setting jsonb;
  v_ban_until timestamptz;
  v_refund_date date;
  v_refunded boolean := false;
begin
  select * into v_match
  from public.active_matches
  where id = p_match_id
  for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_uid is not null and v_uid <> v_match.no_show_reported_by and auth.role() <> 'service_role' then
    raise exception 'ONLY_REPORTER_CAN_RESOLVE_NO_SHOW';
  end if;
  if v_uid is null and auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_match.no_show_resolved then return jsonb_build_object('status', 'already_resolved'); end if;
  if v_match.status <> 'pending_result' then return jsonb_build_object('status', 'invalid_status'); end if;
  if v_match.no_show_reported_at is null or v_match.no_show_reported_by is null then
    return jsonb_build_object('status', 'not_reported');
  end if;

  v_absent_player := case
    when v_match.no_show_reported_by = v_match.player1_id then v_match.player2_id
    else v_match.player1_id
  end;
  v_absent_player_entered_at := case
    when v_absent_player = v_match.player1_id then v_match.player1_matchroom_entered_at
    else v_match.player2_matchroom_entered_at
  end;

  if v_absent_player_entered_at is not null then
    update public.active_matches
    set no_show_reported_by = null,
        no_show_reported_at = null,
        no_show_resolved = false,
        updated_at = now()
    where id = p_match_id;
    return jsonb_build_object(
      'status', 'opponent_present',
      'message', 'Die No-Show-Meldung wurde zurückgezogen, weil der Gegner den Matchroom betreten hat.'
    );
  end if;

  if v_match.no_show_reported_at + interval '5 minutes' > now() then
    return jsonb_build_object(
      'status', 'not_expired',
      'remaining_seconds', greatest(0, extract(epoch from (v_match.no_show_reported_at + interval '5 minutes' - now()))::integer)
    );
  end if;

  if coalesce(v_match.match_mode, 'ranked') = 'private' then
    update public.active_matches
    set status = 'cancelled', no_show_resolved = true, updated_at = now()
    where id = p_match_id;
    return jsonb_build_object('status', 'resolved', 'absent_player_id', v_absent_player, 'private_match', true);
  end if;

  v_refund_date := coalesce(v_match.daily_quota_usage_date, (v_match.created_at at time zone 'Europe/Berlin')::date);
  update public.daily_ranked_match_usage
  set matches_started = matches_started - 1
  where user_id = v_match.no_show_reported_by
    and usage_date = v_refund_date
    and matches_started > 0;
  v_refunded := found;

  select value into v_setting
  from public.app_settings
  where key = 'no_show_queue_ban_minutes';
  v_ban_minutes := greatest(1, least(1440, coalesce((v_setting->>'minutes')::integer, 15)));
  v_ban_until := now() + make_interval(mins => v_ban_minutes);

  update public.profiles
  set queue_banned_until = greatest(coalesce(queue_banned_until, now()), v_ban_until),
      queue_ban_reason = 'No-Show: Match nicht rechtzeitig betreten/bestätigt',
      no_show_strikes = coalesce(no_show_strikes, 0) + 1
  where "supabaseId" = v_absent_player::text;

  update public.active_matches
  set status = 'cancelled', no_show_resolved = true, updated_at = now()
  where id = p_match_id;

  return jsonb_build_object(
    'status', 'resolved',
    'absent_player_id', v_absent_player,
    'queue_banned_until', v_ban_until,
    'queue_ban_minutes', v_ban_minutes,
    'daily_quota_refunded', v_refunded
  );
end;
$$;

-- This is deliberately independent of a browser tab. It only resolves a
-- report after the target player has never entered the Matchroom; the locked
-- resolver rechecks that condition before any cancellation or queue sanction.
create or replace function public.finalize_expired_no_shows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_result jsonb;
  v_finalized integer := 0;
begin
  for v_match_id in
    select id
    from public.active_matches
    where status = 'pending_result'
      and no_show_reported_at is not null
      and coalesce(no_show_resolved, false) = false
      and no_show_reported_at <= now() - interval '5 minutes'
    order by no_show_reported_at asc
    for update skip locked
  loop
    begin
      select public.resolve_no_show(v_match_id) into v_result;
      if v_result->>'status' = 'resolved' then
        v_finalized := v_finalized + 1;
      end if;
    exception
      when others then
        insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
        values (
          v_match_id,
          null,
          'no_show_finalization_failed',
          'pending_result',
          'pending_result',
          jsonb_build_object('source', 'server_timeout', 'error', sqlerrm)
        );
    end;
  end loop;

  return v_finalized;
end;
$$;

revoke all on function public.mark_matchroom_entered(uuid) from public, anon;
revoke all on function public.finalize_expired_no_shows() from public, anon, authenticated;
revoke all on function public.finalize_expired_match_confirmations() from public, anon, authenticated;

grant execute on function public.mark_matchroom_entered(uuid) to authenticated;
grant execute on function public.finalize_expired_no_shows() to service_role;
grant execute on function public.finalize_expired_match_confirmations() to service_role;

notify pgrst, 'reload schema';
