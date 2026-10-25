-- Moderator workspace: keep the role intentionally narrow, give operators an
-- ownership workflow for support, and harden the SECURITY DEFINER RPC boundary.

drop function if exists public.mod_get_tickets(text, integer, integer);

create or replace function public.mod_get_tickets(
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  subject text,
  category text,
  status text,
  priority text,
  created_at timestamptz,
  updated_at timestamptz,
  admin_note text,
  assigned_to_id text,
  assigned_to_username text,
  message_count bigint,
  last_message text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  return query
  select
    t.id,
    p.username,
    t.subject,
    t.category,
    t.status,
    t.priority,
    t.created_at,
    t.updated_at,
    t.admin_note,
    t.assigned_to_id,
    assignee.username,
    count(tm.id)::bigint,
    max(tm.content)
  from public.support_tickets t
  join public.profiles p on p."supabaseId" = t.user_id::text
  left join public.profiles assignee on assignee."supabaseId" = t.assigned_to_id
  left join public.ticket_messages tm on tm.ticket_id = t.id
  where p_status is null or t.status = p_status
  group by t.id, p.username, assignee.username
  order by
    case t.priority
      when 'urgent' then 1
      when 'high' then 2
      when 'normal' then 3
      else 4
    end,
    t.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.mod_claim_ticket(p_ticket_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_subject text;
  v_status text;
  v_assigned_to text;
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  select subject, status, assigned_to_id into v_subject, v_status, v_assigned_to
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Ticket nicht gefunden';
  end if;
  if v_status in ('resolved', 'closed') then
    raise exception 'Geschlossene Tickets können nicht übernommen werden';
  end if;
  if v_assigned_to is not null and v_assigned_to <> auth.uid()::text then
    raise exception 'Dieses Ticket wurde bereits von einem anderen Teammitglied übernommen';
  end if;

  update public.support_tickets
  set assigned_to_id = auth.uid()::text,
      status = case when status = 'open' then 'in_progress' else status end,
      updated_at = now()
  where id = p_ticket_id;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (auth.uid(), coalesce(v_mod_name, 'Moderator'), 'claim_ticket', 'ticket', p_ticket_id::text, v_subject, 'Ticket übernommen');

  return json_build_object('status', 'success', 'message', 'Ticket wurde dir zugewiesen.');
end;
$$;

create or replace function public.mod_get_flagged_players()
returns table (
  id text,
  username text,
  elo integer,
  "gamesPlayed" integer,
  wins integer,
  winrate numeric,
  elo_gain_7d integer,
  account_age_days integer,
  flags text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  return query
  with player_stats as (
    select p.*, coalesce((
      select sum(m.elo_change)::integer
      from public.matches m
      where m.user_id::text = p."supabaseId"
        and m.status = 'completed'
        and coalesce(m.completed_at, m.created_at) >= now() - interval '7 days'
    ), 0) as calculated_elo_gain_7d
    from public.profiles p
    where (p.is_banned = false or p.is_banned is null)
      and p.username is not null
      and coalesce(p."gamesPlayed", 0) >= 5
  )
  select
    s.id::text,
    coalesce(s.username, 'Unbekannt'),
    coalesce(s.elo, 0)::integer,
    coalesce(s."gamesPlayed", 0)::integer,
    coalesce(s.wins, 0)::integer,
    case when coalesce(s."gamesPlayed", 0) > 0 then round((coalesce(s.wins, 0)::numeric / s."gamesPlayed"::numeric) * 100, 1) else 0::numeric end,
    s.calculated_elo_gain_7d,
    coalesce(extract(day from (now() - s.created_at))::integer, 999),
    array_remove(array[
      case when coalesce(s."gamesPlayed", 0) >= 10 and coalesce(s.wins, 0)::numeric / nullif(s."gamesPlayed", 0) >= 0.85 then 'Hohe Winrate (≥85%)' end,
      case when coalesce(s."gamesPlayed", 0) >= 15 and coalesce(s.wins, 0)::numeric / nullif(s."gamesPlayed", 0) >= 0.90 then 'Extremer Win-Streak (≥90%)' end,
      case when coalesce(s.elo, 0) >= 1200 and s.created_at is not null and extract(day from (now() - s.created_at)) < 14 then 'Neuer Account in High-Elo' end,
      case when s.calculated_elo_gain_7d >= 200 then 'Schneller Elo-Anstieg (+200 / 7T)' end
    ], null)
  from player_stats s
  where (coalesce(s."gamesPlayed", 0) >= 10 and coalesce(s.wins, 0)::numeric / nullif(s."gamesPlayed", 0) >= 0.85)
     or (coalesce(s.elo, 0) >= 1200 and s.created_at is not null and extract(day from (now() - s.created_at)) < 14)
     or s.calculated_elo_gain_7d >= 200
  order by s.calculated_elo_gain_7d desc, s.elo desc;
end;
$$;

create or replace function public.mod_cancel_dispute(p_match_id uuid, p_mod_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_match_label text;
  v_note text := nullif(btrim(coalesce(p_mod_note, '')), '');
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  select player1_username || ' vs ' || player2_username into v_match_label
  from public.active_matches
  where id = p_match_id and status = 'disputed'
  for update;

  if not found then
    raise exception 'Match nicht gefunden oder nicht mehr im Dispute-Status';
  end if;

  update public.active_matches
  set status = 'cancelled',
      cancellation_reason = coalesce(v_note, 'Dispute durch Moderation annulliert'),
      updated_at = now()
  where id = p_match_id;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (auth.uid(), coalesce(v_mod_name, 'Moderator'), 'cancel_dispute', 'match', p_match_id::text, v_match_label, coalesce('Notiz: ' || v_note, 'Ohne Notiz'));

  return json_build_object('result_status', 'success', 'result_message', 'Match wurde annulliert. Keine Elo-Änderung.');
end;
$$;

create or replace function public.mod_force_cancel_match(p_match_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_match_label text;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  select player1_username || ' vs ' || player2_username into v_match_label
  from public.active_matches
  where id = p_match_id and status in ('pending_result', 'awaiting_confirmation', 'disputed')
  for update;

  if not found then
    raise exception 'Match nicht gefunden oder bereits beendet';
  end if;

  update public.active_matches
  set status = 'cancelled',
      cancellation_reason = coalesce(v_reason, 'Match durch Moderation abgebrochen'),
      updated_at = now()
  where id = p_match_id;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (auth.uid(), coalesce(v_mod_name, 'Moderator'), 'force_cancel_match', 'match', p_match_id::text, v_match_label, coalesce('Grund: ' || v_reason, 'Kein Grund angegeben'));
end;
$$;

create or replace function public.mod_warn_player(p_player_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_player_name text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Der Warnhinweis muss zwischen 3 und 500 Zeichen lang sein';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  select username into v_player_name
  from public.profiles
  where id = p_player_id;

  if v_player_name is null then
    raise exception 'Spieler nicht gefunden';
  end if;

  insert into public.notifications (user_id, type, title, body, href)
  select p."supabaseId"::uuid, 'moderation_warning', 'Hinweis vom RankedDarts-Team', v_reason, '/fairplay'
  from public.profiles p
  where p.id = p_player_id;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (auth.uid(), coalesce(v_mod_name, 'Moderator'), 'warn_player', 'profile', p_player_id::text, v_player_name, 'Warnung: ' || v_reason);
end;
$$;

alter function public.mod_get_ticket_detail(uuid) set search_path = public;
alter function public.mod_send_ticket_reply(uuid, text) set search_path = public;
alter function public.mod_update_ticket(uuid, text, text, text) set search_path = public;
alter function public.mod_get_live_matches() set search_path = public;
alter function public.mod_force_cancel_match(uuid, text) set search_path = public;
alter function public.mod_get_flagged_players() set search_path = public;
alter function public.mod_get_logs(integer) set search_path = public;
alter function public.mod_cancel_dispute(uuid, text) set search_path = public;
alter function public.mod_get_disputed_matches() set search_path = public;
alter function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, text) set search_path = public;
alter function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) set search_path = public;

revoke all on function public.mod_get_tickets(text, integer, integer) from public, anon;
revoke all on function public.mod_claim_ticket(uuid) from public, anon;
revoke all on function public.mod_get_ticket_detail(uuid) from public, anon;
revoke all on function public.mod_send_ticket_reply(uuid, text) from public, anon;
revoke all on function public.mod_update_ticket(uuid, text, text, text) from public, anon;
revoke all on function public.mod_get_live_matches() from public, anon;
revoke all on function public.mod_force_cancel_match(uuid, text) from public, anon;
revoke all on function public.mod_get_flagged_players() from public, anon;
revoke all on function public.mod_warn_player(uuid, text) from public, anon;
revoke all on function public.mod_get_logs(integer) from public, anon;
revoke all on function public.mod_cancel_dispute(uuid, text) from public, anon;
revoke all on function public.mod_get_disputed_matches() from public, anon;
revoke all on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, text) from public, anon;
revoke all on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) from public, anon;

grant execute on function public.mod_get_tickets(text, integer, integer) to authenticated;
grant execute on function public.mod_claim_ticket(uuid) to authenticated;
grant execute on function public.mod_get_ticket_detail(uuid) to authenticated;
grant execute on function public.mod_send_ticket_reply(uuid, text) to authenticated;
grant execute on function public.mod_update_ticket(uuid, text, text, text) to authenticated;
grant execute on function public.mod_get_live_matches() to authenticated;
grant execute on function public.mod_force_cancel_match(uuid, text) to authenticated;
grant execute on function public.mod_get_flagged_players() to authenticated;
grant execute on function public.mod_warn_player(uuid, text) to authenticated;
grant execute on function public.mod_get_logs(integer) to authenticated;
grant execute on function public.mod_cancel_dispute(uuid, text) to authenticated;
grant execute on function public.mod_get_disputed_matches() to authenticated;
grant execute on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, text) to authenticated;
grant execute on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) to authenticated;
