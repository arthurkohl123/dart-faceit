-- A no-show is a bracket-only resolution. Keep its preconditions as strict as
-- a manually recorded result, even when the RPC is called outside the admin UI.

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
  if v_match.player1_id is null or v_match.player2_id is null then
    raise exception 'No-Shows können erst bei einer vollständigen Paarung gewertet werden.';
  end if;
  if v_match.active_match_id is null then
    raise exception 'Zu diesem Turniermatch gibt es keinen Matchroom.';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = v_match.tournament_id
  for update;

  if v_tournament.status <> 'live' then raise exception 'No-Shows können nur bei laufenden Turnieren gewertet werden.'; end if;
  if v_match.status = 'completed' then raise exception 'Dieses Turniermatch ist bereits abgeschlossen.'; end if;
  if p_winner_id not in (v_match.player1_id, v_match.player2_id) then raise exception 'Der Gewinner gehört nicht zu diesem Turniermatch.'; end if;

  select status into v_active_status
  from public.active_matches
  where id = v_match.active_match_id
  for update;

  if not found then raise exception 'Der zugehörige Matchroom wurde nicht gefunden.'; end if;
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

revoke all on function public.admin_resolve_tournament_no_show(uuid, uuid, text) from public;
grant execute on function public.admin_resolve_tournament_no_show(uuid, uuid, text) to authenticated;
