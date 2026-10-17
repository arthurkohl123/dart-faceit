-- Platform activity for the protected admin operations workspace.
-- active_matches contains one row per matchroom, so these figures cannot double-count players.

create index if not exists active_matches_completed_at_app_idx
  on public.active_matches (completed_at desc, app)
  where status = 'completed';

create or replace function public.admin_get_operations_workspace()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.admin_require_operations_access('read');
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'players_total', (select count(*) from public.profiles where coalesce(is_banned, false) = false),
      'new_players_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'matches_24h', (select count(*) from public.active_matches where status = 'completed' and completed_at >= now() - interval '24 hours'),
      'platform_matches_24h', (
        select jsonb_object_agg(platform, completed_matches)
        from (
          select p.platform, count(m.id)::integer as completed_matches
          from unnest(array['scolia', 'dartcounter', 'autodarts']::text[]) as p(platform)
          left join public.active_matches m
            on m.app = p.platform
            and m.status = 'completed'
            and m.completed_at >= now() - interval '24 hours'
          group by p.platform
        ) platform_counts
      ),
      'matches_7d', (select count(*) from public.active_matches where status = 'completed' and completed_at >= now() - interval '7 days'),
      'premium_active', (select count(*) from public.profiles where coalesce("isPremium", false) = true and coalesce(is_banned, false) = false),
      'completion_rate_7d', coalesce((select round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*) filter (where status in ('completed', 'cancelled')), 0), 1) from public.active_matches where updated_at >= now() - interval '7 days'), 0),
      'avg_completion_minutes_7d', coalesce((select round(avg(extract(epoch from (completed_at - created_at)) / 60.0), 1) from public.active_matches where status = 'completed' and completed_at >= now() - interval '7 days'), 0)
    ),
    'attention', coalesce((
      select jsonb_agg(item order by (item->>'rank')::int desc, item->>'created_at' asc) from (
        select jsonb_build_object('kind','dispute','rank',3,'title','Offener Match-Dispute','detail', concat(m.player1_username, ' vs. ', m.player2_username), 'entity_id',m.id,'created_at',m.created_at) item
        from public.active_matches m where m.status = 'disputed'
        union all
        select jsonb_build_object('kind','ticket','rank',case when t.priority = 'urgent' then 4 when t.priority = 'high' then 3 else 2 end,'title',concat('Support: ', t.subject),'detail',concat(t.username, ' · ', t.priority),'entity_id',t.id,'created_at',t.created_at) item
        from public.support_tickets t where t.status not in ('resolved','closed')
        union all
        select jsonb_build_object('kind','payout','rank',case when p.due_at is not null and p.due_at < now() then 4 else 2 end,'title','Auszahlung offen','detail',concat(p.recipient_username, ' · ', (p.amount_cents / 100.0)::text, ' €'),'entity_id',p.id,'created_at',p.created_at) item
        from public.payout_records p where p.status not in ('paid','cancelled')
        union all
        select jsonb_build_object('kind','case','rank',case when c.priority = 'urgent' then 4 when c.priority = 'high' then 3 else 2 end,'title',c.title,'detail',concat('Fall · ', c.status),'entity_id',c.id,'created_at',c.created_at) item
        from public.admin_cases c where c.status not in ('resolved','closed')
        union all
        select jsonb_build_object('kind','tournament','rank',2,'title',concat('Turnier live: ', t.title),'detail',concat(coalesce(p.participant_count,0), '/', t.max_players, ' Teilnehmer'),'entity_id',t.id,'created_at',t.starts_at) item
        from public.tournaments t left join lateral (select count(*) participant_count from public.tournament_participants tp where tp.tournament_id = t.id) p on true
        where t.status = 'live'
      ) items
    ), '[]'::jsonb),
    'tournaments', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'starts_at',t.starts_at,'participants',coalesce(p.participant_count,0),'open_matches',coalesce(m.open_matches,0),'platform',t.scoring_platform) order by t.starts_at asc)
      from public.tournaments t
      left join lateral (select count(*) participant_count from public.tournament_participants tp where tp.tournament_id = t.id) p on true
      left join lateral (select count(*) open_matches from public.tournament_matches tm where tm.tournament_id = t.id and tm.status <> 'completed') m on true
      where t.status in ('registration','live')
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id',p.id,'username',p.username,'role',coalesce(s.role, case when coalesce(p.is_admin,false) then 'admin' else 'unassigned' end),'is_admin',coalesce(p.is_admin,false),'is_moderator',coalesce(p.is_moderator,false)) order by coalesce(p.is_admin,false) desc, p.username asc)
      from public.profiles p left join public.staff_role_assignments s on s.profile_id = p.id
      where coalesce(p.is_admin,false) = true or coalesce(p.is_moderator,false) = true or s.profile_id is not null
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_get_operations_workspace() from public, anon;
grant execute on function public.admin_get_operations_workspace() to authenticated;
