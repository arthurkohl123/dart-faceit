-- Admin override for legacy tournaments whose check-in window predates this feature.
create or replace function public.admin_manage_tournament_participant(p_tournament_id uuid,p_user_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_old text; v_title text;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_action not in ('remove','disqualify','checkin') then raise exception 'Ungültige Aktion.'; end if;
  select status into v_old from public.tournament_participants where tournament_id=p_tournament_id and user_id=p_user_id for update;
  select title into v_title from public.tournaments where id=p_tournament_id;
  if v_old is null then raise exception 'Teilnehmer nicht gefunden.'; end if;
  if p_action='checkin' then
    if v_old <> 'registered' then raise exception 'Nur registrierte Teilnehmer können eingecheckt werden.'; end if;
    update public.tournament_participants set status='checked_in',checked_in_at=now() where tournament_id=p_tournament_id and user_id=p_user_id;
    insert into public.notifications(user_id,type,title,body,href) values(p_user_id,'tournament_admin_checkin','Check-in bestätigt',coalesce(v_title,'Turnier') || ': Die Turnierleitung hat deinen Check-in bestätigt.','/tournaments');
    return;
  end if;
  update public.tournament_participants set status=case when p_action='disqualify' then 'disqualified' else 'removed' end,
    removed_reason=coalesce(nullif(trim(p_reason),''),'Administrative Entscheidung'),eliminated_at=now()
    where tournament_id=p_tournament_id and user_id=p_user_id;
  insert into public.notifications(user_id,type,title,body,href) values
    (p_user_id,'tournament_participant_removed',case when p_action='disqualify' then 'Vom Turnier disqualifiziert' else 'Turnierteilnahme beendet' end,
     coalesce(v_title,'Turnier') || ': ' || coalesce(nullif(trim(p_reason),''),'Bitte wende dich bei Rückfragen an den Support.'),'/support');
  if v_old in ('registered','checked_in') then perform public.promote_tournament_waitlist(p_tournament_id); end if;
end;
$$;

grant execute on function public.admin_manage_tournament_participant(uuid,uuid,text,text) to authenticated;
