-- Structured Fair-Play reports reuse the existing support-ticket workflow.
-- They remain private to the reporter and the reviewed staff workspace.

alter table public.support_tickets
  add column if not exists reported_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists report_source text;

alter table public.support_tickets
  drop constraint if exists support_tickets_report_source_check;

alter table public.support_tickets
  add constraint support_tickets_report_source_check
  check (report_source is null or report_source in ('matchroom', 'profile'));

create index if not exists support_tickets_player_report_inbox_idx
  on public.support_tickets(priority, updated_at desc)
  where reported_profile_id is not null
    and status not in ('resolved', 'closed');

create unique index if not exists support_tickets_open_player_report_unique
  on public.support_tickets(
    user_id,
    reported_profile_id,
    coalesce(active_match_id, '00000000-0000-0000-0000-000000000000'::uuid),
    incident_kind
  )
  where report_source in ('matchroom', 'profile')
    and status not in ('resolved', 'closed');

create or replace function public.report_player_incident(
  p_target_user_id text,
  p_source text,
  p_match_id uuid default null,
  p_reason text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_reporter_username text;
  v_target public.profiles%rowtype;
  v_match public.active_matches%rowtype;
  v_source text := lower(btrim(coalesce(p_source, '')));
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_kind text;
  v_ticket_id uuid;
  v_priority text;
  v_source_label text;
  v_reason_label text;
begin
  if v_reporter_id is null then
    raise exception 'Anmeldung erforderlich.';
  end if;
  if v_source not in ('matchroom', 'profile') then
    raise exception 'Ungültige Meldequelle.';
  end if;
  if v_reason not in ('abusive_behavior', 'unsporting_behavior', 'suspected_cheating', 'other') then
    raise exception 'Ungültiger Meldegrund.';
  end if;
  if v_message is null or char_length(v_message) < 10 or char_length(v_message) > 1600 then
    raise exception 'Bitte beschreibe den Vorfall mit 10 bis 1.600 Zeichen.';
  end if;

  select username into v_reporter_username
  from public.profiles
  where "supabaseId" = v_reporter_id::text;
  if v_reporter_username is null then
    raise exception 'Profil nicht gefunden.';
  end if;

  select * into v_target
  from public.profiles
  where "supabaseId" = nullif(btrim(coalesce(p_target_user_id, '')), '')
  for share;
  if not found then
    raise exception 'Spieler nicht gefunden.';
  end if;
  if v_target."supabaseId" = v_reporter_id::text then
    raise exception 'Du kannst dein eigenes Profil nicht melden.';
  end if;
  if v_target.is_banned is true then
    raise exception 'Dieser Account ist bereits gesperrt.';
  end if;

  if v_source = 'matchroom' then
    if p_match_id is null then
      raise exception 'Matchroom fehlt.';
    end if;

    select * into v_match
    from public.active_matches
    where id = p_match_id
    for share;
    if not found then
      raise exception 'Matchroom nicht gefunden.';
    end if;
    if v_reporter_id not in (v_match.player1_id, v_match.player2_id) then
      raise exception 'Du bist nicht Teil dieses Matchrooms.';
    end if;
    if v_target."supabaseId" <> (
      case when v_match.player1_id = v_reporter_id then v_match.player2_id else v_match.player1_id end
    )::text then
      raise exception 'Im Matchroom kannst du nur deinen Gegner melden.';
    end if;
  elsif p_match_id is not null then
    raise exception 'Eine Profil-Meldung darf keinen Matchroom enthalten.';
  elsif coalesce(v_target.is_publicly_visible, true) is false then
    raise exception 'Dieses Profil ist nicht öffentlich meldebar.';
  end if;

  if (
    select count(*)
    from public.support_tickets ticket
    where ticket.user_id = v_reporter_id
      and ticket.incident_kind like 'player_report_%'
      and ticket.created_at >= now() - interval '24 hours'
  ) >= 5 then
    raise exception 'Du kannst maximal fünf Spielermeldungen innerhalb von 24 Stunden einreichen.';
  end if;

  v_kind := 'player_report_' || v_reason;
  select ticket.id into v_ticket_id
  from public.support_tickets ticket
  where ticket.user_id = v_reporter_id
    and ticket.reported_profile_id = v_target.id
    and ticket.active_match_id is not distinct from p_match_id
    and ticket.incident_kind = v_kind
    and ticket.status not in ('resolved', 'closed')
  order by ticket.updated_at desc
  limit 1;

  if v_ticket_id is not null then
    return jsonb_build_object('ticket_id', v_ticket_id, 'created', false);
  end if;

  v_priority := case when v_reason = 'suspected_cheating' then 'high' else 'normal' end;
  v_source_label := case when v_source = 'matchroom' then 'Matchroom' else 'Öffentliches Spielerprofil' end;
  v_reason_label := case v_reason
    when 'abusive_behavior' then 'Beleidigungen oder respektloses Verhalten'
    when 'unsporting_behavior' then 'Unsportliches Verhalten'
    when 'suspected_cheating' then 'Verdacht auf Regelverstoß oder Betrug'
    else 'Etwas anderes'
  end;

  insert into public.support_tickets(
    user_id, username, subject, category, priority,
    active_match_id, reported_profile_id, report_source, incident_kind
  ) values (
    v_reporter_id,
    v_reporter_username,
    'Spielermeldung · ' || left(coalesce(v_target.username, 'Unbekannt'), 90),
    'match_dispute',
    v_priority,
    p_match_id,
    v_target.id,
    v_source,
    v_kind
  ) returning id into v_ticket_id;

  insert into public.ticket_messages(ticket_id, sender_id, sender_name, is_staff, content)
  values (
    v_ticket_id,
    v_reporter_id,
    v_reporter_username,
    false,
    'Spielermeldung' || E'\n\n'
      || 'Gemeldeter Spieler: ' || coalesce(v_target.username, 'Unbekannt') || E'\n'
      || 'Quelle: ' || v_source_label || E'\n'
      || 'Grund: ' || v_reason_label
      || case when p_match_id is not null then E'\nMatchroom: ' || p_match_id::text else '' end
      || E'\n\nBeschreibung:' || E'\n' || v_message
  );

  return jsonb_build_object('ticket_id', v_ticket_id, 'created', true);
end;
$$;

drop function if exists public.mod_get_tickets(text, integer, integer);

create function public.mod_get_tickets(
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
  last_message text,
  reported_profile_id uuid,
  reported_username text,
  report_source text,
  active_match_id uuid,
  incident_kind text
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
    ticket.id,
    coalesce(requester.username, ticket.username),
    ticket.subject,
    ticket.category,
    ticket.status,
    ticket.priority,
    ticket.created_at,
    ticket.updated_at,
    ticket.admin_note,
    ticket.assigned_to_id,
    assignee.username,
    count(message.id)::bigint,
    (array_agg(message.content order by message.created_at desc) filter (where message.id is not null))[1],
    ticket.reported_profile_id,
    reported.username,
    ticket.report_source,
    ticket.active_match_id,
    ticket.incident_kind
  from public.support_tickets ticket
  left join public.profiles requester on requester."supabaseId" = ticket.user_id::text
  left join public.profiles assignee on assignee."supabaseId" = ticket.assigned_to_id
  left join public.profiles reported on reported.id = ticket.reported_profile_id
  left join public.ticket_messages message on message.ticket_id = ticket.id
  where p_status is null or ticket.status = p_status
  group by ticket.id, requester.username, assignee.username, reported.username
  order by
    case ticket.priority
      when 'urgent' then 1
      when 'high' then 2
      when 'normal' then 3
      else 4
    end,
    ticket.updated_at desc
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
      ticket.id,
      coalesce(requester.username, ticket.username) as username,
      ticket.subject,
      ticket.category,
      ticket.status,
      ticket.priority,
      ticket.created_at,
      ticket.updated_at,
      ticket.admin_note,
      ticket.assigned_to_id,
      assignee.username as assigned_to_username,
      ticket.reported_profile_id,
      reported.username as reported_username,
      ticket.report_source,
      ticket.active_match_id,
      ticket.incident_kind
    from public.support_tickets ticket
    left join public.profiles requester on requester."supabaseId" = ticket.user_id::text
    left join public.profiles assignee on assignee."supabaseId" = ticket.assigned_to_id
    left join public.profiles reported on reported.id = ticket.reported_profile_id
    where ticket.id = p_ticket_id
  ) ticket_row;

  if v_ticket is null then
    raise exception 'Ticket wurde nicht gefunden';
  end if;

  select coalesce(json_agg(message_row order by message_row.created_at), '[]'::json)
  into v_messages
  from (
    select
      message.id,
      coalesce(sender.username, 'Support') as sender_name,
      message.is_staff,
      message.content,
      message.created_at
    from public.ticket_messages message
    left join public.profiles sender on sender."supabaseId" = message.sender_id::text
    where message.ticket_id = p_ticket_id
  ) message_row;

  return json_build_object('ticket', v_ticket, 'messages', v_messages);
end;
$$;

revoke all on function public.report_player_incident(text, text, uuid, text, text) from public, anon;
revoke all on function public.mod_get_tickets(text, integer, integer) from public, anon;
grant execute on function public.report_player_incident(text, text, uuid, text, text) to authenticated;
grant execute on function public.mod_get_tickets(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
