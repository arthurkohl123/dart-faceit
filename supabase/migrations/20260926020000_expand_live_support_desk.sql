-- Support Desk foundation: metadata stays private to staff and is only exposed
-- through narrowly scoped RPC functions.

alter table public.live_support_conversations
  add column if not exists category text not null default 'general'
    check (category in ('general', 'match', 'tournament', 'account', 'payment', 'technical', 'fairplay', 'other')),
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists satisfaction_rating smallint
    check (satisfaction_rating between 1 and 5),
  add column if not exists satisfaction_comment text
    check (satisfaction_comment is null or char_length(satisfaction_comment) <= 600),
  add column if not exists rated_at timestamptz;

create index if not exists live_support_conversation_priority_idx
  on public.live_support_conversations (status, priority, last_message_at desc);

create table if not exists public.live_support_internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.live_support_conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists live_support_internal_notes_conversation_idx
  on public.live_support_internal_notes (conversation_id, created_at desc);
alter table public.live_support_internal_notes enable row level security;
revoke all on public.live_support_internal_notes from anon, authenticated;

create or replace function public.live_support_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p."supabaseId" = auth.uid()::text and coalesce(p.is_admin, false)) $$;

create or replace function public.live_support_admin_update_metadata(p_conversation_id uuid, p_category text default null, p_priority text default null, p_tags text[] default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_category is not null and p_category not in ('general','match','tournament','account','payment','technical','fairplay','other') then raise exception 'INVALID_SUPPORT_CATEGORY'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'INVALID_SUPPORT_PRIORITY'; end if;
  update public.live_support_conversations c set
    category = coalesce(p_category, c.category), priority = coalesce(p_priority, c.priority),
    tags = case when p_tags is null then c.tags else (select coalesce(array_agg(distinct left(btrim(t), 32)), '{}') from unnest(p_tags) t where btrim(t) <> '') end
  where c.id = p_conversation_id;
  if not found then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
end;
$$;

create or replace function public.live_support_admin_add_note(p_conversation_id uuid, p_content text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_content text := btrim(coalesce(p_content, ''));
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if char_length(v_content) not between 1 and 2000 then raise exception 'INVALID_SUPPORT_NOTE'; end if;
  if not exists(select 1 from public.live_support_conversations c where c.id = p_conversation_id) then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  insert into public.live_support_internal_notes(conversation_id, author_id, content) values(p_conversation_id, auth.uid(), v_content) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.live_support_admin_list_notes(p_conversation_id uuid)
returns table(id uuid, author_username text, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query select n.id, coalesce(p.username, 'Team'), n.content, n.created_at
  from public.live_support_internal_notes n left join public.profiles p on p."supabaseId" = n.author_id::text
  where n.conversation_id = p_conversation_id order by n.created_at asc;
end;
$$;

create or replace function public.live_support_admin_get_context(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_requester uuid; v_profile record;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select requester_id into v_requester from public.live_support_conversations where id = p_conversation_id;
  if v_requester is null then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  select p.username, p.elo, p."gamesPlayed" as games_played, p.wins, p.created_at, p.isPremium, p.is_banned, p.scolia_username, p.dartcounter_username, p.autodarts_username into v_profile from public.profiles p where p."supabaseId" = v_requester::text;
  return jsonb_build_object('player', jsonb_build_object('username', coalesce(v_profile.username, 'Spieler'), 'elo', coalesce(v_profile.elo, 1000), 'games_played', coalesce(v_profile.games_played, 0), 'wins', coalesce(v_profile.wins, 0), 'created_at', v_profile.created_at, 'premium', coalesce(v_profile."isPremium", false), 'banned', coalesce(v_profile.is_banned, false), 'platforms', jsonb_build_object('scolia', v_profile.scolia_username, 'dartcounter', v_profile.dartcounter_username, 'autodarts', v_profile.autodarts_username)), 'recent_matches', coalesce((select jsonb_agg(jsonb_build_object('opponent', m.opponent_name, 'result', m.result, 'average', m.my_average, 'completed_at', m.completed_at) order by m.completed_at desc) from (select * from public.matches where user_id = v_requester order by completed_at desc nulls last limit 5) m), '[]'::jsonb), 'previous_support_cases', (select count(*) from public.live_support_conversations where requester_id = v_requester and id <> p_conversation_id));
end;
$$;

create or replace function public.live_support_admin_list_agents()
returns table(user_id uuid, username text, is_available boolean, last_seen_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query select a.user_id, coalesce(p.username, 'Support'), a.is_available and a.last_seen_at >= now() - interval '90 seconds', a.last_seen_at from public.live_support_agents a join public.profiles p on p."supabaseId" = a.user_id::text where coalesce(p.is_admin, false) order by a.is_available desc, p.username;
end;
$$;

create or replace function public.live_support_admin_transfer(p_conversation_id uuid, p_agent_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_requester uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select requester_id into v_requester from public.live_support_conversations where id = p_conversation_id and status = 'active' and agent_id = auth.uid() for update;
  if v_requester is null then raise exception 'LIVE_SUPPORT_TRANSFER_NOT_ALLOWED'; end if;
  if p_agent_id = v_requester then raise exception 'LIVE_SUPPORT_CANNOT_ASSIGN_REQUESTER'; end if;
  if not exists(select 1 from public.live_support_agents a join public.profiles p on p."supabaseId" = a.user_id::text where a.user_id = p_agent_id and a.is_available and a.last_seen_at >= now() - interval '90 seconds' and coalesce(p.is_admin, false)) then raise exception 'LIVE_SUPPORT_TARGET_OFFLINE'; end if;
  update public.live_support_conversations set agent_id = p_agent_id, last_message_at = now() where id = p_conversation_id;
  insert into public.notifications(user_id,type,title,body,href) values(p_agent_id,'live_support_transfer','Live Support übergeben','Eine aktive Unterhaltung wurde dir übergeben.','/admin/support');
end;
$$;

create or replace function public.live_support_rate_conversation(p_conversation_id uuid, p_rating smallint, p_comment text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_rating not between 1 and 5 then raise exception 'INVALID_SUPPORT_RATING'; end if;
  update public.live_support_conversations set satisfaction_rating = p_rating, satisfaction_comment = nullif(left(btrim(coalesce(p_comment,'')),600), ''), rated_at = now() where id = p_conversation_id and requester_id = auth.uid() and status = 'closed' and satisfaction_rating is null;
  if not found then raise exception 'LIVE_SUPPORT_RATING_NOT_AVAILABLE'; end if;
end;
$$;

revoke all on function public.live_support_is_admin() from public;
revoke all on function public.live_support_admin_update_metadata(uuid,text,text,text[]) from public;
revoke all on function public.live_support_admin_add_note(uuid,text) from public;
revoke all on function public.live_support_admin_list_notes(uuid) from public;
revoke all on function public.live_support_admin_get_context(uuid) from public;
revoke all on function public.live_support_admin_list_agents() from public;
revoke all on function public.live_support_admin_transfer(uuid,uuid) from public;
revoke all on function public.live_support_rate_conversation(uuid,smallint,text) from public;
grant execute on function public.live_support_admin_update_metadata(uuid,text,text,text[]) to authenticated;
grant execute on function public.live_support_admin_add_note(uuid,text) to authenticated;
grant execute on function public.live_support_admin_list_notes(uuid) to authenticated;
grant execute on function public.live_support_admin_get_context(uuid) to authenticated;
grant execute on function public.live_support_admin_list_agents() to authenticated;
grant execute on function public.live_support_admin_transfer(uuid,uuid) to authenticated;
grant execute on function public.live_support_rate_conversation(uuid,smallint,text) to authenticated;
