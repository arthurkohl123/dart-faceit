-- Allow staff to review and correct the full result-stat line of a disputed match.
-- The existing RPCs predate the 180s columns and silently omitted them when an
-- administrator resolved a dispute. Keep the old overloads for compatibility
-- and add explicit stat-aware overloads used by the current admin/moderator UI.

drop function if exists public.get_disputed_matches_for_admin();

create or replace function public.get_disputed_matches_for_admin()
returns table (
  match_id uuid,
  player1_id uuid,
  player2_id uuid,
  player1_username text,
  player2_username text,
  player1_elo integer,
  player2_elo integer,
  submitted_by uuid,
  submitted_by_username text,
  submitted_winner_id uuid,
  submitted_winner_username text,
  submitted_player1_legs integer,
  submitted_player2_legs integer,
  submitted_player1_average numeric,
  submitted_player2_average numeric,
  submitted_player1_checkout integer,
  submitted_player2_checkout integer,
  submitted_player1_180s integer,
  submitted_player2_180s integer,
  dispute_reason text,
  dispute_screenshot_url text,
  confirmation_requested_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Nicht autorisiert';
  end if;

  return query
  select
    am.id,
    am.player1_id,
    am.player2_id,
    am.player1_username,
    am.player2_username,
    am.player1_elo,
    am.player2_elo,
    am.submitted_by,
    case
      when am.submitted_by = am.player1_id then am.player1_username
      when am.submitted_by = am.player2_id then am.player2_username
      else null
    end,
    am.submitted_winner_id,
    case
      when am.submitted_winner_id = am.player1_id then am.player1_username
      when am.submitted_winner_id = am.player2_id then am.player2_username
      else null
    end,
    am.submitted_player1_legs,
    am.submitted_player2_legs,
    am.submitted_player1_average,
    am.submitted_player2_average,
    am.submitted_player1_checkout,
    am.submitted_player2_checkout,
    coalesce(am.submitted_player1_180s, 0),
    coalesce(am.submitted_player2_180s, 0),
    am.dispute_reason,
    am.dispute_screenshot_url,
    am.confirmation_requested_at,
    am.created_at
  from public.active_matches am
  where am.status = 'disputed'
  order by am.created_at desc;
end;
$$;

revoke all on function public.get_disputed_matches_for_admin() from public;
grant execute on function public.get_disputed_matches_for_admin() to authenticated;

drop function if exists public.mod_get_disputed_matches();

create or replace function public.mod_get_disputed_matches()
returns table (
  match_id uuid,
  player1_id uuid,
  player2_id uuid,
  player1_username text,
  player2_username text,
  player1_elo integer,
  player2_elo integer,
  submitted_by uuid,
  submitted_by_username text,
  submitted_winner_id uuid,
  submitted_winner_username text,
  submitted_player1_legs integer,
  submitted_player2_legs integer,
  submitted_player1_average numeric,
  submitted_player2_average numeric,
  submitted_player1_checkout integer,
  submitted_player2_checkout integer,
  submitted_player1_180s integer,
  submitted_player2_180s integer,
  dispute_reason text,
  dispute_screenshot_url text,
  confirmation_requested_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  return query
  select
    am.id,
    am.player1_id,
    am.player2_id,
    am.player1_username,
    am.player2_username,
    am.player1_elo,
    am.player2_elo,
    am.submitted_by,
    p_sub.username,
    am.submitted_winner_id,
    p_win.username,
    am.submitted_player1_legs,
    am.submitted_player2_legs,
    am.submitted_player1_average,
    am.submitted_player2_average,
    am.submitted_player1_checkout,
    am.submitted_player2_checkout,
    coalesce(am.submitted_player1_180s, 0),
    coalesce(am.submitted_player2_180s, 0),
    am.dispute_reason,
    am.dispute_screenshot_url,
    am.confirmation_requested_at,
    am.created_at
  from public.active_matches am
  left join public.profiles p_sub on p_sub."supabaseId" = am.submitted_by::text
  left join public.profiles p_win on p_win."supabaseId" = am.submitted_winner_id::text
  where am.status = 'disputed'
  order by am.created_at asc;
end;
$$;

revoke all on function public.mod_get_disputed_matches() from public;
grant execute on function public.mod_get_disputed_matches() to authenticated;

create or replace function public.admin_resolve_disputed_match(
  p_match_id uuid,
  p_winner_id uuid,
  p_player1_legs integer,
  p_player2_legs integer,
  p_player1_average numeric,
  p_player2_average numeric,
  p_player1_checkout integer,
  p_player2_checkout integer,
  p_player1_one_eighties integer,
  p_player2_one_eighties integer,
  p_admin_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.active_matches%rowtype;
  v_loser_id uuid;
  v_winner_elo integer;
  v_loser_elo integer;
  v_elo_change integer;
  v_p1_elo_change integer;
  v_p2_elo_change integer;
  v_admin_id uuid := auth.uid();
  v_admin_username text;
  v_winner_name text;
begin
  -- This RPC is shared by the admin and moderator workspaces. Both wrappers
  -- still enforce their respective staff role before reaching this function.
  if not public.is_mod_or_admin() then
    raise exception 'Nur Moderatoren oder Administratoren können Disputes auflösen';
  end if;

  select username into v_admin_username
  from public.profiles
  where "supabaseId" = v_admin_id::text;

  select * into v_match
  from public.active_matches
  where id = p_match_id
    and status = 'disputed'
  for update;

  if not found then
    raise exception 'Match nicht gefunden oder nicht im Status disputed';
  end if;

  if exists (select 1 from public.matches where active_match_id = p_match_id) then
    raise exception 'Für dieses Match existiert bereits eine Match-Historie';
  end if;

  if p_winner_id = v_match.player1_id then
    v_loser_id := v_match.player2_id;
    v_winner_elo := v_match.player1_elo;
    v_loser_elo := v_match.player2_elo;
    v_winner_name := v_match.player1_username;
  elsif p_winner_id = v_match.player2_id then
    v_loser_id := v_match.player1_id;
    v_winner_elo := v_match.player2_elo;
    v_loser_elo := v_match.player1_elo;
    v_winner_name := v_match.player2_username;
  else
    raise exception 'Ungültige Gewinner-ID';
  end if;

  if p_player1_legs is null or p_player2_legs is null
    or p_player1_legs < 0 or p_player2_legs < 0
    or p_player1_legs = p_player2_legs then
    raise exception 'Das Ergebnis muss einen eindeutigen Sieger haben';
  end if;

  if coalesce(p_player1_one_eighties, 0) not between 0 and 100
    or coalesce(p_player2_one_eighties, 0) not between 0 and 100 then
    raise exception 'Die 180er-Angabe muss zwischen 0 und 100 liegen';
  end if;

  v_elo_change := greatest(1, least(32, public.calculate_elo_change(v_winner_elo, v_loser_elo)));
  v_p1_elo_change := case when p_winner_id = v_match.player1_id then v_elo_change else -v_elo_change end;
  v_p2_elo_change := -v_p1_elo_change;

  update public.active_matches
  set status = 'completed',
      submitted_winner_id = p_winner_id,
      submitted_player1_legs = p_player1_legs,
      submitted_player2_legs = p_player2_legs,
      submitted_player1_average = p_player1_average,
      submitted_player2_average = p_player2_average,
      submitted_player1_checkout = p_player1_checkout,
      submitted_player2_checkout = p_player2_checkout,
      submitted_player1_180s = coalesce(p_player1_one_eighties, 0),
      submitted_player2_180s = coalesce(p_player2_one_eighties, 0),
      confirmed_by = v_admin_id,
      completed_at = now(),
      updated_at = now()
  where id = p_match_id;

  update public.profiles
  set elo = greatest(0, elo + v_elo_change),
      "gamesPlayed" = "gamesPlayed" + 1,
      wins = wins + 1
  where "supabaseId" = p_winner_id::text;

  update public.profiles
  set elo = greatest(0, elo - v_elo_change),
      "gamesPlayed" = "gamesPlayed" + 1
  where "supabaseId" = v_loser_id::text;

  insert into public.matches (
    active_match_id, user_id, opponent_id, opponent_name, opponent_elo,
    legs_won, legs_lost, result, is_win, my_average, highest_checkout,
    one_eighties, elo_change, status, match_mode, app
  ) values (
    v_match.id, v_match.player1_id, v_match.player2_id, v_match.player2_username, v_match.player2_elo,
    p_player1_legs, p_player2_legs,
    p_player1_legs::text || ':' || p_player2_legs::text,
    p_winner_id = v_match.player1_id, p_player1_average, p_player1_checkout,
    coalesce(p_player1_one_eighties, 0), v_p1_elo_change, 'completed', coalesce(v_match.match_mode, 'ranked'), v_match.app
  ), (
    v_match.id, v_match.player2_id, v_match.player1_id, v_match.player1_username, v_match.player1_elo,
    p_player2_legs, p_player1_legs,
    p_player2_legs::text || ':' || p_player1_legs::text,
    p_winner_id = v_match.player2_id, p_player2_average, p_player2_checkout,
    coalesce(p_player2_one_eighties, 0), v_p2_elo_change, 'completed', coalesce(v_match.match_mode, 'ranked'), v_match.app
  );

  insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
  values (
    p_match_id, v_admin_id, 'admin_dispute_resolved', 'disputed', 'completed',
    jsonb_build_object(
      'winner_id', p_winner_id,
      'elo_change', v_elo_change,
      'player1_one_eighties', coalesce(p_player1_one_eighties, 0),
      'player2_one_eighties', coalesce(p_player2_one_eighties, 0),
      'admin_note', p_admin_note
    )
  );

  insert into public.admin_logs(admin_id, admin_username, action, target_type, target_id, target_label, details)
  values (
    v_admin_id,
    coalesce(v_admin_username, 'Admin'),
    'RESOLVE_DISPUTE',
    'MATCH',
    p_match_id::text,
    v_match.player1_username || ' vs ' || v_match.player2_username,
    'Gewinner: ' || v_winner_name || '. Elo-Änderung: ' || v_elo_change
      || '. 180er: ' || coalesce(p_player1_one_eighties, 0) || ':' || coalesce(p_player2_one_eighties, 0)
      || '. Notiz: ' || coalesce(p_admin_note, '—')
  );

  return json_build_object(
    'result_status', 'success',
    'result_message', 'Dispute erfolgreich aufgelöst.',
    'elo_change', v_elo_change
  );
end;
$$;

revoke all on function public.admin_resolve_disputed_match(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) from public;
grant execute on function public.admin_resolve_disputed_match(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) to authenticated;

create or replace function public.mod_resolve_dispute(
  p_match_id uuid,
  p_winner_id uuid,
  p_player1_legs integer,
  p_player2_legs integer,
  p_player1_average numeric default null,
  p_player2_average numeric default null,
  p_player1_checkout integer default null,
  p_player2_checkout integer default null,
  p_player1_one_eighties integer default 0,
  p_player2_one_eighties integer default 0,
  p_mod_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_result json;
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  v_result := public.admin_resolve_disputed_match(
    p_match_id,
    p_winner_id,
    p_player1_legs,
    p_player2_legs,
    p_player1_average,
    p_player2_average,
    p_player1_checkout,
    p_player2_checkout,
    p_player1_one_eighties,
    p_player2_one_eighties,
    p_mod_note
  );

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, details)
  values (
    auth.uid(),
    v_mod_name,
    'resolve_dispute',
    'match',
    p_match_id::text,
    'Gewinner: ' || p_winner_id::text
      || ' | 180er: ' || coalesce(p_player1_one_eighties, 0) || ':' || coalesce(p_player2_one_eighties, 0)
      || coalesce(' | Notiz: ' || p_mod_note, '')
  );

  return v_result;
end;
$$;

revoke all on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) from public;
grant execute on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) to authenticated;
