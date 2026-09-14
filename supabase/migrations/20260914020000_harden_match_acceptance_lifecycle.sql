-- Match acceptance is a state transition shared by two browsers.  Keeping it
-- in one locked database function prevents a double-click, a delayed response
-- or two simultaneous accepts from leaving a match in pending_accept forever.

alter table public.active_matches
  add column if not exists cancellation_reason text;

create or replace function public.accept_match_invitation(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
  v_showdown record;
  v_daily_limit_reached boolean := false;
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
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_uid not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'NOT_MATCH_PARTICIPANT';
  end if;

  -- The endpoint is deliberately idempotent. A browser may retry after a
  -- connection drop even though its first request already succeeded.
  if v_match.status = 'pending_result' then
    return jsonb_build_object('status', 'both_accepted', 'match_id', v_match.id);
  end if;
  if v_match.status <> 'pending_accept' then
    return jsonb_build_object('status', 'already_handled', 'match_id', v_match.id, 'match_status', v_match.status);
  end if;

  if v_match.accept_deadline is not null and v_match.accept_deadline <= now() then
    update public.active_matches
    set status = 'cancelled', cancellation_reason = 'accept_timeout', updated_at = now()
    where id = v_match.id and status = 'pending_accept';
    return jsonb_build_object('status', 'expired', 'match_id', v_match.id);
  end if;

  update public.active_matches
  set player1_accepted = case when v_uid = v_match.player1_id then true else player1_accepted end,
      player2_accepted = case when v_uid = v_match.player2_id then true else player2_accepted end,
      updated_at = now()
  where id = v_match.id;

  select * into v_match from public.active_matches where id = p_match_id for update;
  if not (coalesce(v_match.player1_accepted, false) and coalesce(v_match.player2_accepted, false)) then
    return jsonb_build_object('status', 'waiting', 'match_id', v_match.id);
  end if;

  -- Do not rely on the trigger to discover the Free limit after both players
  -- have accepted.  That would roll back the start transition and leave an
  -- invitation with two accepted flags behind.  We cancel it deliberately,
  -- without charging either player, and let both clients recover cleanly.
  if coalesce(v_match.match_mode, 'ranked') = 'ranked' then
    select * into v_showdown from public.get_wednesday_showdown_status();
    if not (coalesce(v_showdown.is_active, false) and coalesce(v_showdown.free_limit_override, false)) then
      select exists (
        select 1
        from unnest(array[v_match.player1_id, v_match.player2_id]) as participant(user_id)
        where not public.has_active_premium(participant.user_id)
          and coalesce((
            select usage.matches_started
            from public.daily_ranked_match_usage usage
            where usage.user_id = participant.user_id
              and usage.usage_date = (now() at time zone 'Europe/Berlin')::date
          ), 0) >= 4
      ) into v_daily_limit_reached;
    end if;
  end if;

  if v_daily_limit_reached then
    update public.active_matches
    set status = 'cancelled', cancellation_reason = 'daily_match_limit', updated_at = now()
    where id = v_match.id and status = 'pending_accept';
    insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
    values (v_match.id, v_uid, 'acceptance_cancelled_limit', 'pending_accept', 'cancelled', jsonb_build_object('reason', 'daily_match_limit'));
    return jsonb_build_object('status', 'daily_limit', 'match_id', v_match.id);
  end if;

  update public.active_matches
  set status = 'pending_result', updated_at = now()
  where id = v_match.id and status = 'pending_accept';

  insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
  values (v_match.id, v_uid, 'match_accepted', 'pending_accept', 'pending_result', '{}'::jsonb);

  return jsonb_build_object('status', 'both_accepted', 'match_id', v_match.id);
end;
$$;

revoke all on function public.accept_match_invitation(uuid) from public;
grant execute on function public.accept_match_invitation(uuid) to authenticated;

-- Any active matchmaking request is also an opportunity to remove expired
-- invitations, including invitations whose users closed their browsers.  This
-- is intentionally global: expired rows must never block only the other player.
create or replace function public.cleanup_expired_match_acceptances()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled integer;
begin
  update public.active_matches
  set status = 'cancelled', cancellation_reason = 'accept_timeout', updated_at = now()
  where status = 'pending_accept'
    and accept_deadline is not null
    and accept_deadline <= now();
  get diagnostics v_cancelled = row_count;
  return v_cancelled;
end;
$$;

revoke all on function public.cleanup_expired_match_acceptances() from public;
grant execute on function public.cleanup_expired_match_acceptances() to authenticated;

-- Keep the public live list strictly to matches that were actually accepted.
-- The existing endpoint already follows this rule; the index makes that path
-- reliable as the live list grows.
create index if not exists active_matches_live_ranked_idx
  on public.active_matches (created_at desc)
  where status in ('pending_result', 'awaiting_confirmation', 'disputed')
    and coalesce(match_mode, 'ranked') = 'ranked';
