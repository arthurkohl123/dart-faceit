-- Never reveal the opponent before both players have accepted the invitation.
-- The notification is also visible outside /matchmaking, so it must not carry
-- the opponent's username in its body.

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
      (new.player1_id, 'match_found', 'Match gefunden', 'Ein Gegner wartet auf deine Annahme. Du hast 30 Sekunden.', '/matchmaking'),
      (new.player2_id, 'match_found', 'Match gefunden', 'Ein Gegner wartet auf deine Annahme. Du hast 30 Sekunden.', '/matchmaking');
  end if;
  return new;
end;
$$;

-- Redact already-created match-found notifications as well. This prevents a
-- previously stored opponent name from remaining visible in the inbox.
update public.notifications
set body = 'Ein Gegner wartet auf deine Annahme. Du hast 30 Sekunden.'
where type = 'match_found';
