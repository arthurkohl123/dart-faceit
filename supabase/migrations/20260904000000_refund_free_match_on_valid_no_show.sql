-- A player who waits in the matchroom and successfully resolves a ranked
-- no-show must not lose one of their four daily Free matches.  Keep the
-- actual booking date on the match so the refund is deterministic, including
-- around midnight in the Europe/Berlin day boundary.

alter table public.active_matches
  add column if not exists daily_quota_usage_date date;

create or replace function public.enforce_free_daily_match_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_is_premium boolean;
  v_matches_started integer;
  v_usage_date date := (now() at time zone 'Europe/Berlin')::date;
begin
  if coalesce(new.match_mode, 'ranked') <> 'ranked' then
    return new;
  end if;

  -- Only a successfully accepted normal queue match consumes daily quota.
  if not (old.status = 'pending_accept' and new.status = 'pending_result') then
    return new;
  end if;

  new.daily_quota_usage_date := v_usage_date;

  foreach v_player_id in array array[new.player1_id, new.player2_id] loop
    select coalesce("isPremium", false)
    into v_is_premium
    from public.profiles
    where "supabaseId" = v_player_id::text;

    if not coalesce(v_is_premium, false) then
      insert into public.daily_ranked_match_usage as usage (user_id, usage_date, matches_started)
      values (v_player_id, v_usage_date, 1)
      on conflict (user_id, usage_date) do update
      set matches_started = usage.matches_started + 1
      where usage.matches_started < 4
      returning matches_started into v_matches_started;

      if not found then
        raise exception 'DAILY_MATCH_LIMIT: Free-Nutzer können maximal 4 Ranked Matches pro Tag starten.';
      end if;
    end if;
  end loop;

  return new;
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
  v_ban_minutes integer := 15;
  v_setting jsonb;
  v_ban_until timestamptz;
  v_refund_date date;
  v_refunded boolean := false;
begin
  select *
  into v_match
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
  if v_match.no_show_reported_at + interval '5 minutes' > now() then
    return jsonb_build_object(
      'status', 'not_expired',
      'remaining_seconds', greatest(0, extract(epoch from (v_match.no_show_reported_at + interval '5 minutes' - now()))::integer)
    );
  end if;

  v_absent_player := case
    when v_match.no_show_reported_by = v_match.player1_id then v_match.player2_id
    else v_match.player1_id
  end;

  if coalesce(v_match.match_mode, 'ranked') = 'private' then
    update public.active_matches
    set status = 'cancelled', no_show_resolved = true, updated_at = now()
    where id = p_match_id;
    return jsonb_build_object('status', 'resolved', 'absent_player_id', v_absent_player, 'private_match', true);
  end if;

  -- The reporter was present. Refund only their booked Free match; the
  -- absent player remains charged and receives the configured queue penalty.
  v_refund_date := coalesce(
    v_match.daily_quota_usage_date,
    (v_match.created_at at time zone 'Europe/Berlin')::date
  );
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

grant execute on function public.resolve_no_show(uuid) to authenticated;
