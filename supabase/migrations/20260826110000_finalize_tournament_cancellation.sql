-- Cancelling a live tournament must also close its unfinished matchrooms.
create or replace function public.admin_cancel_tournament(p_tournament_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_title text; v_reason text:=coalesce(nullif(trim(p_reason),''),'Turnier wurde durch die Turnierleitung abgesagt.');
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  update public.tournaments set status='cancelled',cancellation_reason=v_reason,updated_at=now()
    where id=p_tournament_id and status in ('registration','live') returning title into v_title;
  if v_title is null then raise exception 'Turnier kann nicht abgesagt werden.'; end if;

  update public.active_matches am set status='cancelled'
    from public.tournament_matches tm
    where tm.tournament_id=p_tournament_id and tm.active_match_id=am.id and am.status not in ('completed','cancelled');

  insert into public.notifications(user_id,type,title,body,href)
    select user_id,'tournament_cancelled','Turnier abgesagt',v_title || ': ' || v_reason,'/tournaments'
    from public.tournament_participants where tournament_id=p_tournament_id and status not in ('withdrawn','removed');
end;
$$;

create or replace function public.notify_tournament_champion()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  if new.status='completed' and new.winner_id is not null
     and (old.status is distinct from 'completed' or old.winner_id is distinct from new.winner_id) then
    select username into v_name from public.profiles where "supabaseId"=new.winner_id::text;
    insert into public.notifications(user_id,type,title,body,href)
      select user_id,'tournament_completed','Turnier abgeschlossen',
        new.title || ': ' || coalesce(v_name,'Der Gewinner') || ' holt den Titel' || case when new.prize_title is null then '.' else ' und gewinnt ' || new.prize_title || '.' end,
        '/tournaments'
      from public.tournament_participants where tournament_id=new.id and status not in ('withdrawn','removed');
  end if;
  return new;
end;
$$;

drop trigger if exists on_tournament_champion_notification on public.tournaments;
create trigger on_tournament_champion_notification
after update of status,winner_id on public.tournaments
for each row execute function public.notify_tournament_champion();

grant execute on function public.admin_cancel_tournament(uuid,text) to authenticated;
