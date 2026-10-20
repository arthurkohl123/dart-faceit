-- Correct the 180s-aware admin path so manual dispute resolutions use the
-- same player Elo ordering and history result format as normal finalisation.
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

  v_elo_change := greatest(1, least(50, public.calculate_elo_change(v_winner_elo, v_loser_elo)));
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
