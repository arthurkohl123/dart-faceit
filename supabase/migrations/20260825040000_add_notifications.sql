create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "Users read own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "Users mark own notifications read" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.notify_tournament_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from public.tournaments where id = new.tournament_id;
  insert into public.notifications(user_id, type, title, body, href)
  values (new.user_id, 'tournament_registration', 'Turnier-Anmeldung bestätigt', coalesce(v_title, 'Dein Turnier') || ' ist in deiner Cup Arena gespeichert.', '/tournaments');
  return new;
end;
$$;

drop trigger if exists on_tournament_participant_notification on public.tournament_participants;
create trigger on_tournament_participant_notification after insert on public.tournament_participants
for each row execute function public.notify_tournament_registration();

create or replace function public.create_tournament_matchroom(p_tournament_match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches%rowtype;
  v_player1_name text; v_player2_name text; v_player1_elo integer; v_player2_elo integer;
  v_active_match_id uuid; v_best_of integer;
begin
  select * into v_match from public.tournament_matches where id = p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_match.active_match_id is not null then return v_match.active_match_id; end if;
  if v_match.player1_id is null or v_match.player2_id is null then raise exception 'Die Paarung ist noch nicht vollständig.'; end if;
  select username, coalesce(elo, 1000) into v_player1_name, v_player1_elo from public.profiles where "supabaseId" = v_match.player1_id::text;
  select username, coalesce(elo, 1000) into v_player2_name, v_player2_elo from public.profiles where "supabaseId" = v_match.player2_id::text;
  select best_of into v_best_of from public.tournaments where id = v_match.tournament_id;
  insert into public.active_matches(player1_id, player2_id, player1_username, player2_username, player1_elo, player2_elo, status)
  values (v_match.player1_id, v_match.player2_id, coalesce(v_player1_name, 'Spieler 1'), coalesce(v_player2_name, 'Spieler 2'), coalesce(v_player1_elo, 1000), coalesce(v_player2_elo, 1000), 'pending_result') returning id into v_active_match_id;
  update public.tournament_matches set active_match_id = v_active_match_id, status = 'ready' where id = p_tournament_match_id;
  insert into public.notifications(user_id, type, title, body, href) values
    (v_match.player1_id, 'tournament_match_ready', 'Dein Turniermatch ist bereit', coalesce(v_player2_name, 'Dein Gegner') || ' wartet im Matchroom.', '/result?matchId=' || v_active_match_id || '&bestOf=' || coalesce(v_best_of, 7)),
    (v_match.player2_id, 'tournament_match_ready', 'Dein Turniermatch ist bereit', coalesce(v_player1_name, 'Dein Gegner') || ' wartet im Matchroom.', '/result?matchId=' || v_active_match_id || '&bestOf=' || coalesce(v_best_of, 7));
  return v_active_match_id;
end;
$$;

create or replace function public.notify_match_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient uuid;
  v_opponent text;
  v_href text;
begin
  if new.status = 'awaiting_confirmation' and old.status is distinct from 'awaiting_confirmation' then
    v_recipient := case when new.submitted_by = new.player1_id then new.player2_id else new.player1_id end;
    v_opponent := case when v_recipient = new.player1_id then new.player2_username else new.player1_username end;
    select '/result?matchId=' || new.id || '&bestOf=' || t.best_of into v_href from public.tournament_matches tm join public.tournaments t on t.id = tm.tournament_id where tm.active_match_id = new.id;
    insert into public.notifications(user_id, type, title, body, href)
    values (v_recipient, 'match_confirmation', 'Ergebnis wartet auf dich', coalesce(v_opponent, 'Dein Gegner') || ' hat ein Ergebnis eingereicht. Bitte bestätige oder widersprich.', coalesce(v_href, '/result?matchId=' || new.id));
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.notifications(user_id, type, title, body, href) values
      (new.player1_id, 'match_completed', 'Match abgeschlossen', 'Das Ergebnis wurde bestätigt und dein Rating aktualisiert.', '/history'),
      (new.player2_id, 'match_completed', 'Match abgeschlossen', 'Das Ergebnis wurde bestätigt und dein Rating aktualisiert.', '/history');
  end if;
  return new;
end;
$$;

drop trigger if exists on_match_status_notification on public.active_matches;
create trigger on_match_status_notification after update of status on public.active_matches
for each row execute function public.notify_match_status_change();

-- Existing open tournament rooms receive a one-time notification as well.
insert into public.notifications(user_id, type, title, body, href)
select participant.user_id, 'tournament_match_ready', 'Dein Turniermatch ist bereit', opponent.username || ' wartet im Matchroom.', '/result?matchId=' || tm.active_match_id || '&bestOf=' || t.best_of
from public.tournament_matches tm
join public.tournaments t on t.id = tm.tournament_id
join lateral (values (tm.player1_id, tm.player2_id), (tm.player2_id, tm.player1_id)) as participant(user_id, opponent_id) on true
left join public.profiles opponent on opponent."supabaseId" = participant.opponent_id::text
where t.status = 'live' and tm.status = 'ready' and tm.active_match_id is not null
  and not exists (select 1 from public.notifications n where n.user_id = participant.user_id and n.type = 'tournament_match_ready' and n.href like '/result?matchId=' || tm.active_match_id || '%');

do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
grant execute on function public.mark_all_notifications_read() to authenticated;
