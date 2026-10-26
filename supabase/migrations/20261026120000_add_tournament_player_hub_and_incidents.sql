-- The tournament overview is deliberately player-centred: it exposes only the
-- next actionable match and reuses the existing support ticket workflow for
-- incidents, instead of creating a second moderation queue.

alter table public.support_tickets
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null,
  add column if not exists tournament_match_id uuid references public.tournament_matches(id) on delete set null,
  add column if not exists active_match_id uuid references public.active_matches(id) on delete set null,
  add column if not exists incident_kind text;

create index if not exists support_tickets_tournament_context_idx
  on public.support_tickets(tournament_id, status, updated_at desc)
  where tournament_id is not null;

create unique index if not exists support_tickets_open_tournament_incident_unique
  on public.support_tickets(user_id, tournament_match_id, incident_kind)
  where tournament_match_id is not null
    and incident_kind is not null
    and status not in ('resolved', 'closed');

create or replace function public.get_my_tournament_hub()
returns table(
  tournament_id uuid,
  title text,
  tournament_status text,
  tournament_format text,
  starts_at timestamptz,
  participant_status text,
  checked_in boolean,
  next_match_id uuid,
  active_match_id uuid,
  round_number integer,
  match_number integer,
  opponent_username text,
  match_status text,
  open_incident_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich.';
  end if;

  return query
  select
    tournament.id,
    tournament.title,
    tournament.status,
    tournament.tournament_format,
    tournament.starts_at,
    participant.status,
    participant.checked_in_at is not null,
    next_match.id,
    next_match.active_match_id,
    next_match.round_number,
    next_match.match_number,
    next_match.opponent_username,
    next_match.status,
    coalesce(incident_counts.open_incident_count, 0)
  from public.tournament_participants participant
  join public.tournaments tournament on tournament.id = participant.tournament_id
  left join lateral (
    select
      match.id,
      match.active_match_id,
      match.round_number,
      match.match_number,
      match.status,
      coalesce(opponent.username, 'Gegner wird ermittelt') as opponent_username
    from public.tournament_matches match
    left join public.profiles opponent
      on opponent."supabaseId" = (
        case when match.player1_id = auth.uid() then match.player2_id else match.player1_id end
      )::text
    where match.tournament_id = tournament.id
      and auth.uid() in (match.player1_id, match.player2_id)
      and match.status in ('ready', 'scheduled')
    order by (match.status = 'ready') desc, match.round_number, match.match_number
    limit 1
  ) next_match on true
  left join lateral (
    select count(*)::bigint as open_incident_count
    from public.support_tickets ticket
    where ticket.user_id = auth.uid()
      and ticket.tournament_id = tournament.id
      and ticket.status not in ('resolved', 'closed')
  ) incident_counts on true
  where participant.user_id = auth.uid()
    and tournament.status in ('registration', 'live')
    and participant.status in ('registered', 'checked_in', 'waitlisted')
  order by
    case when next_match.status = 'ready' then 0 when tournament.status = 'live' then 1 else 2 end,
    tournament.starts_at;
end;
$$;

create or replace function public.report_tournament_incident(
  p_tournament_match_id uuid,
  p_incident_kind text,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_kind text := lower(btrim(coalesce(p_incident_kind, '')));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_match public.tournament_matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_ticket_id uuid;
  v_opponent_id uuid;
  v_opponent_name text;
  v_subject text;
  v_detail text;
begin
  if v_user_id is null then
    raise exception 'Anmeldung erforderlich.';
  end if;
  if p_tournament_match_id is null then
    raise exception 'Turniermatch fehlt.';
  end if;
  if v_kind not in ('opponent_absent', 'technical_problem', 'result_question') then
    raise exception 'Ungültiger Vorfalltyp.';
  end if;
  if v_message is not null and char_length(v_message) > 1600 then
    raise exception 'Deine Beschreibung darf maximal 1.600 Zeichen lang sein.';
  end if;

  select * into v_match
  from public.tournament_matches
  where id = p_tournament_match_id
  for update;
  if not found then
    raise exception 'Turniermatch nicht gefunden.';
  end if;
  if v_user_id not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'Du bist nicht Teil dieses Turniermatches.';
  end if;
  if v_match.status <> 'ready' or v_match.active_match_id is null then
    raise exception 'Ein Vorfall kann nur für einen aktuell geöffneten Matchroom gemeldet werden.';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = v_match.tournament_id
  for share;
  if not found or v_tournament.status <> 'live' then
    raise exception 'Dieses Turnier läuft aktuell nicht.';
  end if;

  select username into v_username
  from public.profiles
  where "supabaseId" = v_user_id::text;
  if v_username is null then
    raise exception 'Profil nicht gefunden.';
  end if;

  select ticket.id into v_ticket_id
  from public.support_tickets ticket
  where ticket.user_id = v_user_id
    and ticket.tournament_match_id = v_match.id
    and ticket.incident_kind = v_kind
    and ticket.status not in ('resolved', 'closed')
  order by ticket.updated_at desc
  limit 1;
  if v_ticket_id is not null then
    return v_ticket_id;
  end if;

  v_subject := 'Turnierhilfe · ' || left(v_tournament.title, 90) || ' · Match ' || v_match.round_number || '.' || v_match.match_number;
  v_detail := case v_kind
    when 'opponent_absent' then 'Gegner nicht erschienen'
    when 'technical_problem' then 'Technisches Problem'
    else 'Frage zum Ergebnis'
  end;

  insert into public.support_tickets(
    user_id, username, subject, category, priority,
    tournament_id, tournament_match_id, active_match_id, incident_kind
  ) values (
    v_user_id, v_username, v_subject, 'match_dispute',
    case when v_kind = 'opponent_absent' then 'high' else 'normal' end,
    v_tournament.id, v_match.id, v_match.active_match_id, v_kind
  ) returning id into v_ticket_id;

  insert into public.ticket_messages(ticket_id, sender_id, sender_name, is_staff, content)
  values (
    v_ticket_id,
    v_user_id,
    v_username,
    false,
    'Turniermatch: ' || v_detail || case when v_message is not null then E'\n\n' || v_message else '' end
  );

  v_opponent_id := case when v_match.player1_id = v_user_id then v_match.player2_id else v_match.player1_id end;
  select username into v_opponent_name
  from public.profiles
  where "supabaseId" = v_opponent_id::text;
  if v_opponent_id is not null then
    insert into public.notifications(user_id, type, title, body, href)
    values (
      v_opponent_id,
      'tournament_incident_opened',
      'Turniermatch wird geprüft',
      coalesce(v_username, 'Dein Gegner') || ' hat für euren Matchroom einen Vorfall gemeldet. Die Turnierleitung prüft ihn.',
      '/tournaments/' || v_tournament.id::text
    );
  end if;

  return v_ticket_id;
end;
$$;

revoke all on function public.get_my_tournament_hub() from public;
revoke all on function public.report_tournament_incident(uuid, text, text) from public;
grant execute on function public.get_my_tournament_hub() to authenticated;
grant execute on function public.report_tournament_incident(uuid, text, text) to authenticated;
