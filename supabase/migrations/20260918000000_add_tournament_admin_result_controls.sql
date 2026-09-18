-- Full admin result controls for live tournaments. A manual result follows the
-- same locked finalisation path as a player-confirmed ranked match, so Elo,
-- history, stats and bracket progression cannot drift apart.

create or replace function public.admin_record_tournament_result(
  p_tournament_match_id uuid,
  p_winner_id uuid,
  p_player1_legs integer,
  p_player2_legs integer,
  p_player1_average numeric default null,
  p_player2_average numeric default null,
  p_player1_checkout integer default null,
  p_player2_checkout integer default null,
  p_player1_one_eighties integer default 0,
  p_player2_one_eighties integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_match public.tournament_matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_active_match public.active_matches%rowtype;
  v_required_legs integer;
  v_result jsonb;
  v_admin_id uuid := auth.uid();
begin
  if not public.is_tournament_admin() then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  select * into v_tournament_match
  from public.tournament_matches
  where id = p_tournament_match_id
  for update;

  if not found then
    raise exception 'Turniermatch nicht gefunden.';
  end if;
  select * into v_tournament
  from public.tournaments
  where id = v_tournament_match.tournament_id
  for update;
  if v_tournament.status <> 'live' then
    raise exception 'Ergebnisse können nur bei laufenden Turnieren eingetragen werden.';
  end if;
  if v_tournament_match.status = 'completed' then
    raise exception 'Dieses Turniermatch ist bereits abgeschlossen.';
  end if;
  if v_tournament_match.player1_id is null or v_tournament_match.player2_id is null then
    raise exception 'Das Match hat noch keine zwei Spieler.';
  end if;
  if p_winner_id not in (v_tournament_match.player1_id, v_tournament_match.player2_id) then
    raise exception 'Der Gewinner gehört nicht zu diesem Turniermatch.';
  end if;
  if p_player1_legs is null or p_player2_legs is null
    or p_player1_legs < 0 or p_player2_legs < 0 then
    raise exception 'Beide Leg-Scores müssen gültige positive Werte sein.';
  end if;
  if p_player1_legs = p_player2_legs then
    raise exception 'Ein Turniermatch darf nicht unentschieden enden.';
  end if;

  v_required_legs := greatest(1, (coalesce(v_tournament.best_of, 1) + 1) / 2);
  if (p_winner_id = v_tournament_match.player1_id and (p_player1_legs < v_required_legs or p_player1_legs <= p_player2_legs))
    or (p_winner_id = v_tournament_match.player2_id and (p_player2_legs < v_required_legs or p_player2_legs <= p_player1_legs)) then
    raise exception 'Score und Sieger passen nicht zum Best-of-%-Format.', v_tournament.best_of;
  end if;
  if (p_player1_average is not null and (p_player1_average < 0 or p_player1_average > 200))
    or (p_player2_average is not null and (p_player2_average < 0 or p_player2_average > 200)) then
    raise exception 'Averages müssen zwischen 0 und 200 liegen.';
  end if;
  if (p_player1_checkout is not null and (p_player1_checkout < 0 or p_player1_checkout > 170))
    or (p_player2_checkout is not null and (p_player2_checkout < 0 or p_player2_checkout > 170))
    or coalesce(p_player1_one_eighties, 0) < 0
    or coalesce(p_player2_one_eighties, 0) < 0 then
    raise exception 'Checkout oder 180er-Angabe ist ungültig.';
  end if;
  if v_tournament_match.active_match_id is null then
    raise exception 'Zu diesem Turniermatch gibt es keinen Matchroom. Nutze bei einem Freilos die No-Show-Wertung.';
  end if;

  select * into v_active_match
  from public.active_matches
  where id = v_tournament_match.active_match_id
  for update;

  if not found or v_active_match.status in ('completed', 'cancelled') then
    raise exception 'Der zugehörige Matchroom kann nicht mehr regulär gewertet werden.';
  end if;

  update public.active_matches
  set status = 'awaiting_confirmation',
      submitted_by = v_admin_id,
      submitted_by_username = coalesce((select username from public.profiles where "supabaseId" = v_admin_id::text), 'Turnierleitung'),
      submitted_winner_id = p_winner_id,
      submitted_winner_username = case when p_winner_id = v_active_match.player1_id then v_active_match.player1_username else v_active_match.player2_username end,
      submitted_player1_legs = p_player1_legs,
      submitted_player2_legs = p_player2_legs,
      submitted_player1_average = p_player1_average,
      submitted_player2_average = p_player2_average,
      submitted_player1_checkout = p_player1_checkout,
      submitted_player2_checkout = p_player2_checkout,
      submitted_player1_180s = coalesce(p_player1_one_eighties, 0),
      submitted_player2_180s = coalesce(p_player2_one_eighties, 0),
      confirmation_requested_at = now(),
      cancellation_reason = null,
      updated_at = now()
  where id = v_active_match.id;

  v_result := public.finalize_ranked_match_result(v_active_match.id, v_admin_id, 'admin_tournament_result');

  insert into public.admin_logs(admin_id, admin_username, action, target_type, target_id, target_label, details)
  values (
    v_admin_id,
    coalesce((select username from public.profiles where "supabaseId" = v_admin_id::text), 'Turnierleitung'),
    'TOURNAMENT_RESULT_RECORDED',
    'TOURNAMENT_MATCH',
    p_tournament_match_id::text,
    coalesce(v_active_match.player1_username, 'Spieler 1') || ' vs ' || coalesce(v_active_match.player2_username, 'Spieler 2'),
    'Ergebnis: ' || p_player1_legs || ':' || p_player2_legs || ' · Gewinner: ' || case when p_winner_id = v_active_match.player1_id then coalesce(v_active_match.player1_username, 'Spieler 1') else coalesce(v_active_match.player2_username, 'Spieler 2') end
  );

  return v_result;
end;
$$;

create or replace function public.admin_resolve_tournament_no_show(
  p_tournament_match_id uuid,
  p_winner_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_active_status text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Gegner nicht erschienen.');
  v_admin_id uuid := auth.uid();
begin
  if not public.is_tournament_admin() then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  select * into v_match
  from public.tournament_matches
  where id = p_tournament_match_id
  for update;

  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  select * into v_tournament
  from public.tournaments
  where id = v_match.tournament_id
  for update;
  if v_tournament.status <> 'live' then raise exception 'No-Shows können nur bei laufenden Turnieren gewertet werden.'; end if;
  if v_match.status = 'completed' then raise exception 'Dieses Turniermatch ist bereits abgeschlossen.'; end if;
  if p_winner_id not in (v_match.player1_id, v_match.player2_id) then raise exception 'Der Gewinner gehört nicht zu diesem Turniermatch.'; end if;

  if v_match.active_match_id is not null then
    select status into v_active_status from public.active_matches where id = v_match.active_match_id for update;
    if v_active_status = 'completed' then raise exception 'Der Matchroom ist bereits abgeschlossen.'; end if;

    if v_active_status <> 'cancelled' then
      update public.active_matches
      set status = 'cancelled',
          cancellation_reason = 'Turnier No-Show: ' || v_reason,
          no_show_reported_by = p_winner_id,
          no_show_reported_at = now(),
          no_show_resolved = true,
          updated_at = now()
      where id = v_match.active_match_id;
      -- The status trigger advances the bracket exactly once.
    else
      perform public.advance_tournament_bracket(v_match.id, p_winner_id);
    end if;
  else
    perform public.advance_tournament_bracket(v_match.id, p_winner_id);
  end if;

  insert into public.notifications(user_id, type, title, body, href)
  select participant_id,
         'tournament_no_show_resolved',
         'Turniermatch per No-Show gewertet',
         v_tournament.title || ': ' || v_reason || case when participant_id = p_winner_id then ' Du ziehst ohne Elo-Wertung weiter.' else ' Das Match wurde ohne Elo-Wertung für den Gegner gewertet.' end,
         '/tournaments'
  from unnest(array[v_match.player1_id, v_match.player2_id]) as participant_id;

  insert into public.admin_logs(admin_id, admin_username, action, target_type, target_id, target_label, details)
  values (
    v_admin_id,
    coalesce((select username from public.profiles where "supabaseId" = v_admin_id::text), 'Turnierleitung'),
    'TOURNAMENT_NO_SHOW',
    'TOURNAMENT_MATCH',
    p_tournament_match_id::text,
    v_tournament.title,
    v_reason
  );
end;
$$;

create or replace function public.admin_restart_tournament(
  p_tournament_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Turnier wurde durch die Turnierleitung zurückgesetzt.');
  v_admin_id uuid := auth.uid();
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament.status not in ('registration', 'live', 'cancelled') then
    raise exception 'Abgeschlossene Turniere können nicht zurückgesetzt werden.';
  end if;
  if exists (
    select 1
    from public.tournament_matches tm
    join public.matches m on m.active_match_id = tm.active_match_id
    where tm.tournament_id = p_tournament_id
  ) then
    raise exception 'Dieses Turnier enthält bereits gewertete Matches und kann aus Fairnessgründen nicht zurückgesetzt werden.';
  end if;

  update public.active_matches am
  set status = 'cancelled',
      cancellation_reason = 'Turnier wurde zurückgesetzt: ' || v_reason,
      updated_at = now()
  from public.tournament_matches tm
  where tm.tournament_id = p_tournament_id
    and tm.active_match_id = am.id
    and am.status not in ('completed', 'cancelled');

  delete from public.tournament_matches where tournament_id = p_tournament_id;

  update public.tournament_participants
  set status = case when status in ('registered', 'checked_in') then 'registered' else status end,
      checked_in_at = null,
      wins = 0,
      losses = 0,
      points = 0,
      eliminated_at = null
  where tournament_id = p_tournament_id;

  update public.tournaments
  set status = 'registration',
      winner_id = null,
      cancellation_reason = null,
      updated_at = now()
  where id = p_tournament_id;

  insert into public.notifications(user_id, type, title, body, href)
  select user_id,
         'tournament_restarted',
         'Turnier zurückgesetzt',
         v_tournament.title || ': ' || v_reason || ' Bitte checke vor dem neuen Start erneut ein.',
         '/tournaments'
  from public.tournament_participants
  where tournament_id = p_tournament_id
    and status in ('registered', 'checked_in', 'waitlisted');

  insert into public.admin_logs(admin_id, admin_username, action, target_type, target_id, target_label, details)
  values (
    v_admin_id,
    coalesce((select username from public.profiles where "supabaseId" = v_admin_id::text), 'Turnierleitung'),
    'TOURNAMENT_RESTARTED',
    'TOURNAMENT',
    p_tournament_id::text,
    v_tournament.title,
    v_reason
  );
end;
$$;

revoke all on function public.admin_record_tournament_result(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer) from public;
revoke all on function public.admin_resolve_tournament_no_show(uuid, uuid, text) from public;
revoke all on function public.admin_restart_tournament(uuid, text) from public;
grant execute on function public.admin_record_tournament_result(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer) to authenticated;
grant execute on function public.admin_resolve_tournament_no_show(uuid, uuid, text) to authenticated;
grant execute on function public.admin_restart_tournament(uuid, text) to authenticated;
