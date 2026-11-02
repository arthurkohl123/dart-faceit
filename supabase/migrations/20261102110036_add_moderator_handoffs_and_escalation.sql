-- Give moderators the two team-work actions they need without expanding their
-- access to bans, payments, settings or account roles: hand a case back to
-- the shared inbox and escalate a documented case to every administrator.

create or replace function public.mod_release_ticket(
  p_ticket_id uuid,
  p_handoff_note text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_subject text;
  v_assigned_to text;
  v_status text;
  v_note text := nullif(left(btrim(coalesce(p_handoff_note, '')), 800), '');
  v_is_admin boolean := false;
begin
  if v_actor_id is null or not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  select coalesce(is_admin, false), username
  into v_is_admin, v_actor_name
  from public.profiles
  where "supabaseId" = v_actor_id::text;

  select subject, status, assigned_to_id
  into v_subject, v_status, v_assigned_to
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Ticket nicht gefunden';
  end if;
  if v_status in ('resolved', 'closed') then
    raise exception 'Geschlossene Tickets können nicht übergeben werden';
  end if;
  if v_assigned_to is null then
    raise exception 'Dieses Ticket ist aktuell keinem Teammitglied zugewiesen';
  end if;
  if v_assigned_to <> v_actor_id::text and not coalesce(v_is_admin, false) then
    raise exception 'Nur die zuständige Person oder ein Admin kann dieses Ticket abgeben';
  end if;

  update public.support_tickets
  set assigned_to_id = null,
      status = case when status = 'in_progress' then 'open' else status end,
      admin_note = case
        when v_note is null then admin_note
        when nullif(btrim(coalesce(admin_note, '')), '') is null then 'Übergabe: ' || v_note
        else left(admin_note || E'\n\nÜbergabe: ' || v_note, 1200)
      end,
      updated_at = now()
  where id = p_ticket_id;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (
    v_actor_id,
    coalesce(v_actor_name, 'Moderator'),
    'release_ticket',
    'ticket',
    p_ticket_id::text,
    v_subject,
    coalesce('Übergabe: ' || v_note, 'Ticket in gemeinsame Inbox zurückgegeben')
  );

  return json_build_object('status', 'success', 'message', 'Ticket wurde wieder für das Team freigegeben.');
end;
$$;

create or replace function public.mod_escalate_ticket(
  p_ticket_id uuid,
  p_reason text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_subject text;
  v_status text;
  v_reason text := left(btrim(coalesce(p_reason, '')), 800);
begin
  if v_actor_id is null or not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'Für die Eskalation wird eine kurze interne Begründung benötigt';
  end if;

  select username into v_actor_name
  from public.profiles
  where "supabaseId" = v_actor_id::text;

  select subject, status
  into v_subject, v_status
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Ticket nicht gefunden';
  end if;
  if v_status in ('resolved', 'closed') then
    raise exception 'Geschlossene Tickets können nicht eskaliert werden';
  end if;

  update public.support_tickets
  set priority = 'urgent',
      status = case when status = 'open' then 'in_progress' else status end,
      admin_note = case
        when nullif(btrim(coalesce(admin_note, '')), '') is null then 'ESKALIERT: ' || v_reason
        else left(admin_note || E'\n\nESKALIERT: ' || v_reason, 1200)
      end,
      updated_at = now()
  where id = p_ticket_id;

  insert into public.notifications (user_id, type, title, body, href)
  select
    p."supabaseId"::uuid,
    'moderation_escalation',
    'Eskalierter Moderationsfall',
    coalesce(v_actor_name, 'Moderator') || ' benötigt Unterstützung bei: ' || left(v_subject, 120),
    '/moderator'
  from public.profiles p
  where coalesce(p.is_admin, false) = true;

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (
    v_actor_id,
    coalesce(v_actor_name, 'Moderator'),
    'escalate_ticket',
    'ticket',
    p_ticket_id::text,
    v_subject,
    'An Admin eskaliert: ' || v_reason
  );

  return json_build_object('status', 'success', 'message', 'Admin-Team wurde benachrichtigt und der Fall als dringend markiert.');
end;
$$;

revoke all on function public.mod_release_ticket(uuid, text) from public, anon;
revoke all on function public.mod_escalate_ticket(uuid, text) from public, anon;
grant execute on function public.mod_release_ticket(uuid, text) to authenticated;
grant execute on function public.mod_escalate_ticket(uuid, text) to authenticated;
