-- Keep the Rating adjustment centred at +/-25 for even matches, then scale it
-- smoothly with the expected win probability. This is the transparent 1v1
-- equivalent of FACEIT's match-balance principle: an upset moves Elo more
-- than a win the system expected.
create or replace function public.calculate_elo_change(winner_elo integer, loser_elo integer)
returns integer
language plpgsql
as $$
declare
  v_expected_winner numeric;
  v_change integer;
begin
  v_expected_winner := 1 / (
    1 + power(10::numeric, (loser_elo - winner_elo)::numeric / 400)
  );

  v_change := round(50 * (1 - v_expected_winner))::integer;
  return greatest(1, least(50, v_change));
end;
$$;

-- The value shown in the matchroom must be the same value used on result
-- confirmation. Private duels remain unranked.
create or replace function public.get_match_elo_preview(p_match_id uuid)
returns table(player1_win_change integer, player2_win_change integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.active_matches%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_match
  from public.active_matches
  where id = p_match_id;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if v_actor_id <> v_match.player1_id
     and v_actor_id <> v_match.player2_id
     and not exists (
       select 1
       from public.profiles
       where "supabaseId" = v_actor_id::text
         and coalesce(is_admin, false)
     ) then
    raise exception 'MATCH_ACCESS_DENIED';
  end if;

  if coalesce(v_match.match_mode, 'ranked') <> 'ranked' then
    return query select 0::integer, 0::integer;
    return;
  end if;

  return query
  select
    greatest(1, least(50, public.calculate_elo_change(v_match.player1_elo, v_match.player2_elo))),
    greatest(1, least(50, public.calculate_elo_change(v_match.player2_elo, v_match.player1_elo)));
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
    v_elo_change := greatest(1, least(50, public.calculate_elo_change(v_winner_elo, v_loser_elo)));
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
    legs_won,legs_lost,result,is_win,my_average,highest_checkout,one_eighties,elo_change,status,match_mode,app)
  values
    (p_match_id,v_match.player1_id,v_match.player2_id,v_match.player2_username,v_match.player2_elo,
      coalesce(v_match.submitted_player1_legs,0),coalesce(v_match.submitted_player2_legs,0),
      coalesce(v_match.submitted_player1_legs,0)::text||':'||coalesce(v_match.submitted_player2_legs,0)::text,
      v_winner_id=v_match.player1_id,v_match.submitted_player1_average,v_match.submitted_player1_checkout,
      coalesce(v_match.submitted_player1_180s,0),v_p1_change,'completed',coalesce(v_match.match_mode, 'ranked'),v_match.app),
    (p_match_id,v_match.player2_id,v_match.player1_id,v_match.player1_username,v_match.player1_elo,
      coalesce(v_match.submitted_player2_legs,0),coalesce(v_match.submitted_player1_legs,0),
      coalesce(v_match.submitted_player2_legs,0)::text||':'||coalesce(v_match.submitted_player1_legs,0)::text,
      v_winner_id=v_match.player2_id,v_match.submitted_player2_average,v_match.submitted_player2_checkout,
      coalesce(v_match.submitted_player2_180s,0),v_p2_change,'completed',coalesce(v_match.match_mode, 'ranked'),v_match.app);

  update public.active_matches set status='completed', confirmed_by=p_confirmed_by,
    completed_at=now(), updated_at=now() where id = p_match_id;

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

-- Keep the older admin RPC consistent while it remains callable. The current
-- admin workspace uses the 180s-aware signature below.
create or replace function public.admin_resolve_disputed_match(
  p_match_id uuid,
  p_winner_id uuid,
  p_player1_legs integer,
  p_player2_legs integer,
  p_player1_average numeric,
  p_player2_average numeric,
  p_player1_checkout integer,
  p_player2_checkout integer,
  p_admin_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Nur Administratoren können Disputes auflösen';
  end if;

  return public.admin_resolve_disputed_match(
    p_match_id,
    p_winner_id,
    p_player1_legs,
    p_player2_legs,
    p_player1_average,
    p_player2_average,
    p_player1_checkout,
    p_player2_checkout,
    0,
    0,
    p_admin_note
  );
end;
$$;

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

revoke all on function public.get_match_elo_preview(uuid) from public;
grant execute on function public.get_match_elo_preview(uuid) to authenticated;

revoke all on function public.admin_resolve_disputed_match(uuid, uuid, integer, integer, numeric, numeric, integer, integer, text) from public;
grant execute on function public.admin_resolve_disputed_match(uuid, uuid, integer, integer, numeric, numeric, integer, integer, text) to authenticated;

revoke all on function public.admin_resolve_disputed_match(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) from public;
grant execute on function public.admin_resolve_disputed_match(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) to authenticated;
