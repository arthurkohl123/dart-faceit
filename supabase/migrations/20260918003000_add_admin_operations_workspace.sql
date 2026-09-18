-- RankedDarts operations workspace.
-- Internal operational records are deliberately not exposed through the Data API.

create table if not exists public.staff_role_assignments (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('support', 'moderator', 'tournament_manager', 'finance', 'admin')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 140),
  summary text not null default '' check (char_length(summary) <= 4000),
  case_type text not null default 'general' check (case_type in ('fairplay', 'match', 'support', 'tournament', 'account', 'general')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'investigating', 'waiting', 'resolved', 'closed')),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists admin_cases_status_priority_idx on public.admin_cases(status, priority, updated_at desc);
create index if not exists admin_cases_profile_idx on public.admin_cases(profile_id, updated_at desc);

create table if not exists public.site_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 90),
  body text not null default '' check (char_length(body) <= 280),
  tone text not null default 'info' check (tone in ('info', 'success', 'warning', 'event')),
  href text check (href is null or href ~ '^/[^\\s]*$'),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create index if not exists site_notices_active_window_idx on public.site_notices(is_active, starts_at, expires_at);

alter table public.staff_role_assignments enable row level security;
alter table public.admin_cases enable row level security;
alter table public.site_notices enable row level security;

revoke all on table public.staff_role_assignments, public.admin_cases from anon, authenticated;
grant select on table public.site_notices to anon, authenticated;

drop policy if exists "public can read active site notices" on public.site_notices;
create policy "public can read active site notices" on public.site_notices
  for select to anon, authenticated
  using (is_active = true and starts_at <= now() and (expires_at is null or expires_at > now()));

create or replace function public.admin_require_operations_access(p_permission text default 'admin')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select id, s.role into v_profile_id, v_role
  from public.profiles p
  left join public.staff_role_assignments s on s.profile_id = p.id
  where p."supabaseId" = auth.uid()::text;

  if v_profile_id is null then raise exception 'Kein Team-Zugriff.'; end if;
  if exists (select 1 from public.profiles where id = v_profile_id and coalesce(is_admin, false)) then return v_profile_id; end if;
  if v_role is null then raise exception 'Kein Team-Zugriff.'; end if;
  if p_permission = 'read' then return v_profile_id; end if;
  if p_permission = 'support' and v_role in ('support', 'moderator') then return v_profile_id; end if;
  if p_permission = 'moderation' and v_role = 'moderator' then return v_profile_id; end if;
  if p_permission = 'tournaments' and v_role in ('moderator', 'tournament_manager') then return v_profile_id; end if;
  if p_permission = 'finance' and v_role = 'finance' then return v_profile_id; end if;
  raise exception 'Für diese Aktion fehlt die Berechtigung.';
end;
$$;

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

create or replace function public.admin_get_player_360(p_profile_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles%rowtype; v_result jsonb;
begin
  perform public.admin_require_operations_access('read');
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception 'Spieler nicht gefunden.'; end if;
  select jsonb_build_object(
    'profile', jsonb_build_object('id',v_profile.id,'username',v_profile.username,'elo',v_profile.elo,'games_played',v_profile."gamesPlayed",'wins',v_profile.wins,'created_at',v_profile.created_at,'premium',coalesce(v_profile."isPremium",false),'banned',coalesce(v_profile.is_banned,false),'phone_verified',coalesce(v_profile.phone_verified,false),'queue_banned_until',v_profile.queue_banned_until,'no_show_strikes',coalesce(v_profile.no_show_strikes,0)),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'opponent',case when m.player1_id = v_profile."supabaseId"::uuid then m.player2_username else m.player1_username end,'status',m.status,'app',m.app,'score',concat(coalesce(m.submitted_player1_legs::text,'—'),':',coalesce(m.submitted_player2_legs::text,'—')),'completed_at',m.completed_at,'created_at',m.created_at) order by coalesce(m.completed_at,m.created_at) desc) from (select * from public.active_matches where v_profile."supabaseId"::uuid in (player1_id,player2_id) order by coalesce(completed_at,created_at) desc limit 20) m), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'subject',t.subject,'status',t.status,'priority',t.priority,'created_at',t.created_at) order by t.updated_at desc) from (select * from public.support_tickets where user_id = v_profile."supabaseId"::uuid order by updated_at desc limit 10) t), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'source',p.source_label,'amount_cents',p.amount_cents,'status',p.status,'created_at',p.created_at) order by p.created_at desc) from public.payout_records p where p.recipient_profile_id = v_profile.id), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'type',c.case_type,'status',c.status,'priority',c.priority,'updated_at',c.updated_at) order by c.updated_at desc) from public.admin_cases c where c.profile_id = v_profile.id), '[]'::jsonb),
    'fairplay', coalesce((select jsonb_agg(jsonb_build_object('disposition',a.disposition,'note',a.note,'created_at',a.created_at) order by a.created_at desc) from public.fairplay_review_actions a where a.profile_id = v_profile.id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_list_cases(p_status text default null)
returns table (id uuid, profile_id uuid, username text, title text, summary text, case_type text, priority text, status text, owner_username text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = public
as $$
  select c.id,c.profile_id,p.username,c.title,c.summary,c.case_type,c.priority,c.status,owner.username,c.created_at,c.updated_at
  from public.admin_cases c join public.profiles p on p.id=c.profile_id left join public.profiles owner on owner.id=c.owner_profile_id
  where p_status is null or c.status=p_status order by case c.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,c.updated_at desc;
$$;

create or replace function public.admin_upsert_case(p_case_id uuid default null, p_profile_id uuid default null, p_title text default null, p_summary text default '', p_case_type text default 'general', p_priority text default 'normal', p_status text default 'open', p_owner_profile_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := public.admin_require_operations_access('moderation');
  if p_case_id is null then
    if p_profile_id is null then raise exception 'Bitte wähle einen Spieler.'; end if;
    insert into public.admin_cases(profile_id,title,summary,case_type,priority,status,owner_profile_id,created_by,updated_by,resolved_at)
    values(p_profile_id,trim(p_title),trim(coalesce(p_summary,'')),p_case_type,p_priority,p_status,p_owner_profile_id,auth.uid(),auth.uid(),case when p_status in ('resolved','closed') then now() else null end) returning id into v_id;
  else
    update public.admin_cases set title=trim(coalesce(p_title,title)),summary=trim(coalesce(p_summary,summary)),case_type=coalesce(p_case_type,case_type),priority=coalesce(p_priority,priority),status=coalesce(p_status,status),owner_profile_id=p_owner_profile_id,updated_by=auth.uid(),updated_at=now(),resolved_at=case when p_status in ('resolved','closed') then now() else null end where id=p_case_id returning id into v_id;
    if v_id is null then raise exception 'Fall nicht gefunden.'; end if;
  end if;
  insert into public.admin_logs(admin_id,admin_username,action,target_type,target_id,target_label,details)
  select auth.uid(),coalesce(username,'Admin'),'ADMIN_CASE_UPSERT','admin_case',v_id::text,coalesce(p_title,'Fall'),concat('status=',p_status,', priority=',p_priority) from public.profiles where "supabaseId"=auth.uid()::text;
  return v_id;
end;
$$;

create or replace function public.admin_upsert_site_notice(p_notice_id uuid default null, p_title text default null, p_body text default '', p_tone text default 'info', p_href text default null, p_is_active boolean default true, p_starts_at timestamptz default now(), p_expires_at timestamptz default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform public.admin_require_operations_access('admin');
  if p_notice_id is null then
    insert into public.site_notices(title,body,tone,href,is_active,starts_at,expires_at,created_by) values(trim(p_title),trim(coalesce(p_body,'')),p_tone,nullif(trim(coalesce(p_href,'')),''),coalesce(p_is_active,true),coalesce(p_starts_at,now()),p_expires_at,auth.uid()) returning id into v_id;
  else
    update public.site_notices set title=trim(coalesce(p_title,title)),body=trim(coalesce(p_body,body)),tone=coalesce(p_tone,tone),href=nullif(trim(coalesce(p_href,'')),''),is_active=coalesce(p_is_active,is_active),starts_at=coalesce(p_starts_at,starts_at),expires_at=p_expires_at,updated_at=now() where id=p_notice_id returning id into v_id;
    if v_id is null then raise exception 'Ankündigung nicht gefunden.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_list_site_notices()
returns table (id uuid,title text,body text,tone text,href text,is_active boolean,starts_at timestamptz,expires_at timestamptz,created_at timestamptz)
language sql security definer set search_path = public
as $$ select id,title,body,tone,href,is_active,starts_at,expires_at,created_at from public.site_notices where public.admin_require_operations_access('admin') is not null order by is_active desc,starts_at desc; $$;

create or replace function public.admin_send_broadcast(p_audience text, p_title text, p_body text, p_href text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  perform public.admin_require_operations_access('admin');
  if p_audience not in ('all','premium','active_30d') then raise exception 'Ungültige Empfängergruppe.'; end if;
  insert into public.notifications(user_id,type,title,body,href)
  select p."supabaseId"::uuid,'admin_broadcast',trim(p_title),trim(p_body),nullif(trim(coalesce(p_href,'')),'')
  from public.profiles p where coalesce(p.is_banned,false)=false and (
    p_audience='all' or (p_audience='premium' and coalesce(p."isPremium",false)) or (p_audience='active_30d' and exists(select 1 from public.active_matches m where p."supabaseId"::uuid in(m.player1_id,m.player2_id) and m.created_at >= now()-interval '30 days'))
  );
  get diagnostics v_count = row_count;
  insert into public.admin_logs(admin_id,admin_username,action,target_type,target_label,details)
  select auth.uid(),coalesce(username,'Admin'),'ADMIN_BROADCAST','notification',trim(p_title),concat(p_audience,': ',v_count,' Empfänger') from public.profiles where "supabaseId"=auth.uid()::text;
  return v_count;
end;
$$;

create or replace function public.admin_set_staff_role(p_profile_id uuid, p_role text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.admin_require_operations_access('admin');
  if not exists(select 1 from public.profiles where id=p_profile_id) then raise exception 'Teammitglied nicht gefunden.'; end if;
  if p_role is null or p_role='unassigned' then delete from public.staff_role_assignments where profile_id=p_profile_id;
  else
    if p_role not in ('support','moderator','tournament_manager','finance','admin') then raise exception 'Ungültige Teamrolle.'; end if;
    insert into public.staff_role_assignments(profile_id,role,assigned_by,updated_at) values(p_profile_id,p_role,auth.uid(),now()) on conflict(profile_id) do update set role=excluded.role,assigned_by=excluded.assigned_by,updated_at=now();
  end if;
end;
$$;

-- Public display reads are intentionally narrow; every operational mutation is RPC-only.
revoke all on function public.admin_require_operations_access(text), public.admin_get_operations_workspace(), public.admin_get_player_360(uuid), public.admin_list_cases(text), public.admin_upsert_case(uuid,uuid,text,text,text,text,text,uuid), public.admin_upsert_site_notice(uuid,text,text,text,text,boolean,timestamptz,timestamptz), public.admin_list_site_notices(), public.admin_send_broadcast(text,text,text,text), public.admin_set_staff_role(uuid,text) from public, anon;
grant execute on function public.admin_get_operations_workspace(), public.admin_get_player_360(uuid), public.admin_list_cases(text), public.admin_upsert_case(uuid,uuid,text,text,text,text,text,uuid), public.admin_upsert_site_notice(uuid,text,text,text,text,boolean,timestamptz,timestamptz), public.admin_list_site_notices(), public.admin_send_broadcast(text,text,text,text), public.admin_set_staff_role(uuid,text) to authenticated;
