-- Keep every moderator RPC on one reviewed, source-controlled contract.
-- PostgREST does not reliably support overloaded RPC functions, therefore the
-- obsolete 9-argument dispute resolver is deliberately removed below.

drop function if exists public.mod_resolve_dispute(
  uuid, uuid, integer, integer, numeric, numeric, integer, integer, text
);

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
    coalesce(requester.username, t.username),
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
    (array_agg(tm.content order by tm.created_at desc) filter (where tm.id is not null))[1]
  from public.support_tickets t
  left join public.profiles requester on requester."supabaseId" = t.user_id::text
  left join public.profiles assignee on assignee."supabaseId" = t.assigned_to_id
  left join public.ticket_messages tm on tm.ticket_id = t.id
  where p_status is null or t.status = p_status
  group by t.id, requester.username, assignee.username
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

create or replace function public.mod_get_ticket_detail(p_ticket_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket json;
  v_messages json;
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  select row_to_json(ticket_row)
  into v_ticket
  from (
    select
      t.id,
      coalesce(requester.username, t.username) as username,
      t.subject,
      t.category,
      t.status,
      t.priority,
      t.created_at,
      t.updated_at,
      t.admin_note,
      t.assigned_to_id,
      assignee.username as assigned_to_username
    from public.support_tickets t
    left join public.profiles requester on requester."supabaseId" = t.user_id::text
    left join public.profiles assignee on assignee."supabaseId" = t.assigned_to_id
    where t.id = p_ticket_id
  ) ticket_row;

  if v_ticket is null then
    raise exception 'Ticket wurde nicht gefunden';
  end if;

  select coalesce(json_agg(message_row order by message_row.created_at), '[]'::json)
  into v_messages
  from (
    select
      tm.id,
      coalesce(sender.username, 'Support') as sender_name,
      tm.is_staff,
      tm.content,
      tm.created_at
    from public.ticket_messages tm
    left join public.profiles sender on sender."supabaseId" = tm.sender_id::text
    where tm.ticket_id = p_ticket_id
  ) message_row;

  return json_build_object('ticket', v_ticket, 'messages', v_messages);
end;
$$;

create or replace function public.mod_update_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_priority text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_subject text;
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed') then
    raise exception 'Ungültiger Ticket-Status';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Ungültige Ticket-Priorität';
  end if;
  if p_note is not null and char_length(p_note) > 1200 then
    raise exception 'Die interne Notiz darf maximal 1.200 Zeichen lang sein';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  update public.support_tickets t
  set
    status = coalesce(p_status, t.status),
    priority = coalesce(p_priority, t.priority),
    admin_note = case when p_note is null then t.admin_note else p_note end,
    closed_at = case
      when p_status in ('resolved', 'closed') then coalesce(t.closed_at, now())
      when p_status in ('open', 'in_progress', 'waiting_for_user') then null
      else t.closed_at
    end,
    updated_at = now()
  where t.id = p_ticket_id
  returning t.subject into v_subject;

  if not found then
    raise exception 'Ticket wurde nicht gefunden';
  end if;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (
    auth.uid(),
    coalesce(v_mod_name, 'Moderator'),
    'ticket_update',
    'ticket',
    p_ticket_id::text,
    v_subject,
    concat_ws(' | ',
      case when p_status is not null then 'Status: ' || p_status end,
      case when p_priority is not null then 'Priorität: ' || p_priority end,
      case when p_note is not null then 'Interne Notiz aktualisiert' end
    )
  );
end;
$$;

create or replace function public.mod_send_ticket_reply(p_ticket_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod_name text;
  v_subject text;
  v_status text;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;
  if char_length(v_content) < 1 or char_length(v_content) > 3000 then
    raise exception 'Die Antwort muss zwischen 1 und 3.000 Zeichen lang sein';
  end if;

  select subject, status into v_subject, v_status
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Ticket wurde nicht gefunden';
  end if;
  if v_status in ('resolved', 'closed') then
    raise exception 'Geschlossene Tickets können nicht beantwortet werden';
  end if;

  select username into v_mod_name
  from public.profiles
  where "supabaseId" = auth.uid()::text;

  insert into public.ticket_messages (ticket_id, sender_id, is_staff, content)
  values (p_ticket_id, auth.uid(), true, v_content);

  update public.support_tickets
  set status = 'waiting_for_user', updated_at = now()
  where id = p_ticket_id;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (auth.uid(), coalesce(v_mod_name, 'Moderator'), 'ticket_reply', 'ticket', p_ticket_id::text, v_subject, 'Antwort an Spieler gesendet');
end;
$$;

create or replace function public.mod_get_live_matches()
returns table (
  id uuid,
  player1_id uuid,
  player2_id uuid,
  player1_username text,
  player2_username text,
  player1_elo integer,
  player2_elo integer,
  status text,
  app text,
  created_at timestamptz,
  duration_minutes integer
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
    am.id,
    am.player1_id,
    am.player2_id,
    am.player1_username,
    am.player2_username,
    am.player1_elo,
    am.player2_elo,
    am.status,
    am.app,
    am.created_at,
    greatest(0, floor(extract(epoch from (now() - am.created_at)) / 60)::integer)
  from public.active_matches am
  where am.status in ('pending_result', 'awaiting_confirmation', 'disputed')
  order by am.created_at asc;
end;
$$;

create or replace function public.mod_get_logs(p_limit integer default 100)
returns table (
  id uuid,
  mod_username text,
  action text,
  target_type text,
  target_id text,
  target_label text,
  details text,
  created_at timestamptz
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
  select ml.id, ml.mod_username, ml.action, ml.target_type, ml.target_id, ml.target_label, ml.details, ml.created_at
  from public.moderator_logs ml
  order by ml.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

-- Keep the reviewed 11-argument resolver as the only public RPC shape.
alter function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text)
  set search_path = public;

revoke all on function public.mod_get_tickets(text, integer, integer) from public, anon;
revoke all on function public.mod_get_ticket_detail(uuid) from public, anon;
revoke all on function public.mod_update_ticket(uuid, text, text, text) from public, anon;
revoke all on function public.mod_send_ticket_reply(uuid, text) from public, anon;
revoke all on function public.mod_get_live_matches() from public, anon;
revoke all on function public.mod_get_logs(integer) from public, anon;
revoke all on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) from public, anon;

grant execute on function public.mod_get_tickets(text, integer, integer) to authenticated;
grant execute on function public.mod_get_ticket_detail(uuid) to authenticated;
grant execute on function public.mod_update_ticket(uuid, text, text, text) to authenticated;
grant execute on function public.mod_send_ticket_reply(uuid, text) to authenticated;
grant execute on function public.mod_get_live_matches() to authenticated;
grant execute on function public.mod_get_logs(integer) to authenticated;
grant execute on function public.mod_resolve_dispute(uuid, uuid, integer, integer, numeric, numeric, integer, integer, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
