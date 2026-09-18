-- A ranked invite can be created while a player is browsing anywhere in the
-- app. Store an explicit notification row so the global in-app/browser notice
-- can reliably surface the invitation instead of relying on one page's poll.

create or replace function public.notify_ranked_match_found()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending_accept' and coalesce(new.match_mode, 'ranked') = 'ranked' then
    insert into public.notifications (user_id, type, title, body, href)
    values
      (new.player1_id, 'match_found', 'Match gefunden', coalesce(new.player2_username, 'Dein Gegner') || ' wartet auf deine Annahme. Du hast 30 Sekunden.', '/matchmaking'),
      (new.player2_id, 'match_found', 'Match gefunden', coalesce(new.player1_username, 'Dein Gegner') || ' wartet auf deine Annahme. Du hast 30 Sekunden.', '/matchmaking');
  end if;
  return new;
end;
$$;

drop trigger if exists on_ranked_match_found_notification on public.active_matches;
create trigger on_ranked_match_found_notification
after insert on public.active_matches
for each row execute function public.notify_ranked_match_found();
