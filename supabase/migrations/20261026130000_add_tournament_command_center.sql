-- A focused, read-only dashboard for tournament operators. The existing
-- tournament management screen remains the place for state-changing actions.

create index if not exists tournament_matches_command_center_idx
  on public.tournament_matches(tournament_id, status, round_number, match_number);

create index if not exists support_tickets_command_center_idx
  on public.support_tickets(tournament_id, priority, updated_at desc)
  where tournament_id is not null
    and status not in ('resolved', 'closed');

create or replace function public.admin_get_tournament_command_center()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_tournament_admin() then
    raise exception 'Keine Berechtigung für die Turnierleitung.';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'live_tournaments', (
        select count(*)::integer
        from public.tournaments tournament
        where tournament.status = 'live'
      ),
      'checkin_open', (
        select count(*)::integer
        from public.tournaments tournament
        where tournament.status = 'registration'
          and tournament.check_in_opens_at is not null
          and tournament.check_in_closes_at is not null
          and now() >= tournament.check_in_opens_at
          and now() < tournament.check_in_closes_at
      ),
      'active_matchrooms', (
        select count(*)::integer
        from public.tournament_matches tournament_match
        join public.tournaments tournament on tournament.id = tournament_match.tournament_id
        where tournament.status = 'live'
          and tournament_match.status = 'ready'
          and tournament_match.active_match_id is not null
      ),
      'open_incidents', (
        select count(*)::integer
        from public.support_tickets ticket
        join public.tournaments tournament on tournament.id = ticket.tournament_id
        where tournament.status in ('registration', 'live')
          and ticket.status not in ('resolved', 'closed')
      )
    ),
    'tournaments', coalesce((
      select jsonb_agg(tournament_row.payload order by tournament_row.status_rank, tournament_row.starts_at)
      from (
        select
          case when tournament.status = 'live' then 0 else 1 end as status_rank,
          tournament.starts_at,
          jsonb_build_object(
            'id', tournament.id,
            'title', tournament.title,
            'status', tournament.status,
            'starts_at', tournament.starts_at,
            'check_in_opens_at', tournament.check_in_opens_at,
            'check_in_closes_at', tournament.check_in_closes_at,
            'max_players', tournament.max_players,
            'tournament_format', tournament.tournament_format,
            'scoring_platform', tournament.scoring_platform,
            'participant_count', coalesce(participant_counts.participant_count, 0),
            'checked_in_count', coalesce(participant_counts.checked_in_count, 0),
            'waitlist_count', coalesce(participant_counts.waitlist_count, 0),
            'ready_match_count', coalesce(match_counts.ready_match_count, 0),
            'scheduled_match_count', coalesce(match_counts.scheduled_match_count, 0),
            'completed_match_count', coalesce(match_counts.completed_match_count, 0),
            'open_incident_count', coalesce(incident_counts.open_incident_count, 0),
            'active_matches', coalesce(match_activity.active_matches, '[]'::jsonb)
          ) as payload
        from public.tournaments tournament
        left join lateral (
          select
            (count(*) filter (where participant.status not in ('withdrawn', 'removed', 'disqualified')))::integer as participant_count,
            (count(*) filter (where participant.checked_in_at is not null))::integer as checked_in_count,
            (count(*) filter (where participant.status = 'waitlisted'))::integer as waitlist_count
          from public.tournament_participants participant
          where participant.tournament_id = tournament.id
        ) participant_counts on true
        left join lateral (
          select
            (count(*) filter (where tournament_match.status = 'ready'))::integer as ready_match_count,
            (count(*) filter (where tournament_match.status = 'scheduled'))::integer as scheduled_match_count,
            (count(*) filter (where tournament_match.status = 'completed'))::integer as completed_match_count
          from public.tournament_matches tournament_match
          where tournament_match.tournament_id = tournament.id
        ) match_counts on true
        left join lateral (
          select count(*)::integer as open_incident_count
          from public.support_tickets ticket
          where ticket.tournament_id = tournament.id
            and ticket.status not in ('resolved', 'closed')
        ) incident_counts on true
        left join lateral (
          select jsonb_agg(
            jsonb_build_object(
              'tournament_match_id', active_match.tournament_match_id,
              'active_match_id', active_match.active_match_id,
              'round_number', active_match.round_number,
              'match_number', active_match.match_number,
              'player1_username', active_match.player1_username,
              'player2_username', active_match.player2_username,
              'opened_at', active_match.opened_at,
              'platform', active_match.platform
            )
            order by active_match.round_number, active_match.match_number
          ) as active_matches
          from (
            select
              tournament_match.id as tournament_match_id,
              tournament_match.active_match_id,
              tournament_match.round_number,
              tournament_match.match_number,
              coalesce(matchroom.player1_username, 'Spieler 1') as player1_username,
              coalesce(matchroom.player2_username, 'Spieler 2') as player2_username,
              matchroom.created_at as opened_at,
              matchroom.app as platform
            from public.tournament_matches tournament_match
            join public.active_matches matchroom on matchroom.id = tournament_match.active_match_id
            where tournament_match.tournament_id = tournament.id
              and tournament_match.status = 'ready'
            order by tournament_match.round_number, tournament_match.match_number
            limit 6
          ) active_match
        ) match_activity on true
        where tournament.status in ('registration', 'live')
      ) tournament_row
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(incident_row.payload order by incident_row.priority_rank desc, incident_row.updated_at asc)
      from (
        select
          case ticket.priority
            when 'urgent' then 4
            when 'high' then 3
            when 'normal' then 2
            else 1
          end as priority_rank,
          ticket.updated_at,
          jsonb_build_object(
            'ticket_id', ticket.id,
            'tournament_id', tournament.id,
            'tournament_title', tournament.title,
            'tournament_match_id', ticket.tournament_match_id,
            'active_match_id', coalesce(ticket.active_match_id, tournament_match.active_match_id),
            'round_number', tournament_match.round_number,
            'match_number', tournament_match.match_number,
            'reporter_username', ticket.username,
            'player1_username', coalesce(matchroom.player1_username, 'Spieler 1'),
            'player2_username', coalesce(matchroom.player2_username, 'Spieler 2'),
            'incident_kind', ticket.incident_kind,
            'status', ticket.status,
            'priority', ticket.priority,
            'created_at', ticket.created_at,
            'updated_at', ticket.updated_at
          ) as payload
        from public.support_tickets ticket
        join public.tournaments tournament on tournament.id = ticket.tournament_id
        left join public.tournament_matches tournament_match on tournament_match.id = ticket.tournament_match_id
        left join public.active_matches matchroom on matchroom.id = coalesce(ticket.active_match_id, tournament_match.active_match_id)
        where tournament.status in ('registration', 'live')
          and ticket.status not in ('resolved', 'closed')
        order by
          case ticket.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
          ticket.updated_at asc
        limit 20
      ) incident_row
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_get_tournament_command_center() from public;
revoke execute on function public.admin_get_tournament_command_center() from anon;
grant execute on function public.admin_get_tournament_command_center() to authenticated;
