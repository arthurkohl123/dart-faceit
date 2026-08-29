-- Keep a live tournament and its matchrooms in one consistent state.
-- Players may leave only before a bracket is generated. Administrative
-- removals in a live tournament resolve affected pairings immediately.

create or replace function public.leave_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_old_status text; v_tournament_status text;
begin
  select status into v_tournament_status from public.tournaments where id=p_tournament_id for update;
  if v_tournament_status is null then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament_status <> 'registration' then
    raise exception 'Nach dem Turnierstart kann die Teilnahme nicht mehr selbst zurückgezogen werden.';
  end if;

  select status into v_old_status from public.tournament_participants
    where tournament_id=p_tournament_id and user_id=auth.uid() and status in ('registered','checked_in','waitlisted') for update;
  if v_old_status is null then raise exception 'Keine aktive Anmeldung gefunden.'; end if;

  update public.tournament_participants set status='withdrawn', removed_reason='Vom Spieler abgemeldet'
    where tournament_id=p_tournament_id and user_id=auth.uid();
  if v_old_status in ('registered','checked_in') then perform public.promote_tournament_waitlist(p_tournament_id); end if;
end;
$$;

-- When an admin enters a winner manually, the normal matchroom must be closed
-- as well. Otherwise its players retain a stale active match.
create or replace function public.admin_report_tournament_winner(p_match_id uuid, p_winner_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_active_match_id uuid;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  select active_match_id into v_active_match_id from public.tournament_matches where id=p_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;

  if v_active_match_id is not null then
    update public.active_matches set status='cancelled'
      where id=v_active_match_id and status not in ('completed','cancelled');
  end if;
  perform public.advance_tournament_bracket(p_match_id,p_winner_id);
end;
$$;

-- During registration an admin can manage the roster and promote the waitlist.
-- During a live cup a removal/DQ awards every still-open pairing to the
-- opponent and closes the corresponding matchroom, so a bracket cannot stall.
create or replace function public.admin_manage_tournament_participant(
  p_tournament_id uuid,p_user_id uuid,p_action text,p_reason text default null
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_old text; v_title text; v_tournament_status text;
  v_match record; v_opponent uuid;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_action not in ('remove','disqualify','checkin') then raise exception 'Ungültige Aktion.'; end if;

  select status,title into v_tournament_status,v_title from public.tournaments where id=p_tournament_id for update;
  if v_tournament_status is null then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament_status not in ('registration','live') then raise exception 'Teilnehmer können in diesem Turnier nicht mehr geändert werden.'; end if;

  select status into v_old from public.tournament_participants
    where tournament_id=p_tournament_id and user_id=p_user_id for update;
  if v_old is null then raise exception 'Teilnehmer nicht gefunden.'; end if;

  if p_action='checkin' then
    if v_tournament_status <> 'registration' or v_old <> 'registered' then
      raise exception 'Nur registrierte Teilnehmer können vor dem Start eingecheckt werden.';
    end if;
    update public.tournament_participants set status='checked_in',checked_in_at=now()
      where tournament_id=p_tournament_id and user_id=p_user_id;
    insert into public.notifications(user_id,type,title,body,href) values
      (p_user_id,'tournament_admin_checkin','Check-in bestätigt',coalesce(v_title,'Turnier') || ': Die Turnierleitung hat deinen Check-in bestätigt.','/tournaments');
    return;
  end if;

  update public.tournament_participants
    set status=case when p_action='disqualify' then 'disqualified' else 'removed' end,
        removed_reason=coalesce(nullif(trim(p_reason),''),'Administrative Entscheidung'),
        eliminated_at=now()
    where tournament_id=p_tournament_id and user_id=p_user_id;

  insert into public.notifications(user_id,type,title,body,href) values
    (p_user_id,'tournament_participant_removed',case when p_action='disqualify' then 'Vom Turnier disqualifiziert' else 'Turnierteilnahme beendet' end,
     coalesce(v_title,'Turnier') || ': ' || coalesce(nullif(trim(p_reason),''),'Bitte wende dich bei Rückfragen an den Support.'),'/support');

  if v_tournament_status='registration' then
    if v_old in ('registered','checked_in') then perform public.promote_tournament_waitlist(p_tournament_id); end if;
    return;
  end if;

  for v_match in
    select id,active_match_id,player1_id,player2_id
    from public.tournament_matches
    where tournament_id=p_tournament_id and status<>'completed'
      and (player1_id=p_user_id or player2_id=p_user_id)
    for update
  loop
    v_opponent:=case when v_match.player1_id=p_user_id then v_match.player2_id else v_match.player1_id end;
    if v_opponent is null then continue; end if;
    if v_match.active_match_id is not null then
      update public.active_matches set status='cancelled'
        where id=v_match.active_match_id and status not in ('completed','cancelled');
    end if;
    perform public.advance_tournament_bracket(v_match.id,v_opponent);
  end loop;
end;
$$;

grant execute on function public.leave_tournament(uuid) to authenticated;
grant execute on function public.admin_report_tournament_winner(uuid,uuid) to authenticated;
grant execute on function public.admin_manage_tournament_participant(uuid,uuid,text,text) to authenticated;
