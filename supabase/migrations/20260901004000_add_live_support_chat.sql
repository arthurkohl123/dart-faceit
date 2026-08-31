-- Opt-in live support. Browser roles have no direct table access; every action
-- is scoped through an authenticated RPC and administrators must be assigned to
-- a conversation before they can read or write it.

create table if not exists public.live_support_agents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_available boolean not null default false,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_support_conversations (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'closed')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz not null default now(),
  constraint live_support_conversations_distinct_users check (agent_id is null or agent_id <> requester_id)
);

create unique index if not exists live_support_one_open_conversation_idx
  on public.live_support_conversations (requester_id)
  where status in ('waiting', 'active');

create index if not exists live_support_conversations_status_idx
  on public.live_support_conversations (status, created_at asc);

create table if not exists public.live_support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.live_support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists live_support_messages_conversation_idx
  on public.live_support_messages (conversation_id, created_at asc);

alter table public.live_support_agents enable row level security;
alter table public.live_support_conversations enable row level security;
alter table public.live_support_messages enable row level security;
revoke all on public.live_support_agents from anon, authenticated;
revoke all on public.live_support_conversations from anon, authenticated;
revoke all on public.live_support_messages from anon, authenticated;

create or replace function public.live_support_get_user_state()
returns table (
  is_available boolean,
  agents_online integer,
  conversation_id uuid,
  conversation_status text,
  agent_username text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_agents_online integer := 0;
  v_conversation_id uuid;
  v_conversation_status text;
  v_agent_username text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select count(*)::integer into v_agents_online
  from public.live_support_agents agent
  join public.profiles profile on profile."supabaseId" = agent.user_id::text
  where agent.is_available = true
    and agent.last_seen_at >= now() - interval '90 seconds'
    and coalesce(profile.is_admin, false) = true;

  select conversation.id, conversation.status, profile.username
  into v_conversation_id, v_conversation_status, v_agent_username
  from public.live_support_conversations conversation
  left join public.profiles profile on profile."supabaseId" = conversation.agent_id::text
  where conversation.requester_id = v_uid
    and conversation.status in ('waiting', 'active')
  order by conversation.created_at desc
  limit 1;

  return query select
    v_agents_online > 0,
    v_agents_online,
    v_conversation_id,
    v_conversation_status,
    v_agent_username;
end;
$$;

create or replace function public.live_support_set_agent_availability(p_available boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile."supabaseId" = v_uid::text and coalesce(profile.is_admin, false) = true
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  insert into public.live_support_agents as agent (user_id, is_available, last_seen_at, updated_at)
  values (v_uid, coalesce(p_available, false), now(), now())
  on conflict (user_id) do update
    set is_available = excluded.is_available,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;
  return coalesce(p_available, false);
end;
$$;

create or replace function public.live_support_agent_heartbeat()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile."supabaseId" = v_uid::text and coalesce(profile.is_admin, false) = true
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  update public.live_support_agents
  set last_seen_at = now(), updated_at = now()
  where user_id = v_uid and is_available = true;
  return found;
end;
$$;

create or replace function public.live_support_get_agent_state()
returns table (
  is_available boolean,
  agents_online integer,
  waiting_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_available boolean := false;
  v_online integer := 0;
  v_waiting integer := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile."supabaseId" = v_uid::text and coalesce(profile.is_admin, false) = true
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select coalesce(agent.is_available, false) and agent.last_seen_at >= now() - interval '90 seconds'
  into v_available
  from public.live_support_agents agent where agent.user_id = v_uid;
  v_available := coalesce(v_available, false);

  select count(*)::integer into v_online
  from public.live_support_agents agent
  join public.profiles profile on profile."supabaseId" = agent.user_id::text
  where agent.is_available = true and agent.last_seen_at >= now() - interval '90 seconds'
    and coalesce(profile.is_admin, false) = true;
  select count(*)::integer into v_waiting from public.live_support_conversations where status = 'waiting';
  return query select v_available, v_online, v_waiting;
end;
$$;

create or replace function public.live_support_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.live_support_conversations%rowtype;
  v_requester_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_conversation
  from public.live_support_conversations conversation
  where conversation.requester_id = v_uid and conversation.status in ('waiting', 'active')
  order by conversation.created_at desc limit 1;
  if found then
    return jsonb_build_object('conversation_id', v_conversation.id, 'status', v_conversation.status);
  end if;

  if not exists (
    select 1 from public.live_support_agents agent
    join public.profiles profile on profile."supabaseId" = agent.user_id::text
    where agent.is_available = true and agent.last_seen_at >= now() - interval '90 seconds'
      and coalesce(profile.is_admin, false) = true
  ) then raise exception 'LIVE_SUPPORT_OFFLINE'; end if;

  if (select count(*) from public.live_support_conversations conversation
      where conversation.requester_id = v_uid and conversation.created_at >= now() - interval '15 minutes') >= 3 then
    raise exception 'LIVE_SUPPORT_RATE_LIMIT';
  end if;

  begin
    insert into public.live_support_conversations (requester_id)
    values (v_uid)
    returning * into v_conversation;
  exception when unique_violation then
    select * into v_conversation from public.live_support_conversations conversation
    where conversation.requester_id = v_uid and conversation.status in ('waiting', 'active')
    order by conversation.created_at desc limit 1;
  end;

  select coalesce(profile.username, 'Ein Spieler') into v_requester_name
  from public.profiles profile where profile."supabaseId" = v_uid::text;

  insert into public.notifications (user_id, type, title, body, href)
  select agent.user_id, 'live_support_request', 'Neue Live-Support-Anfrage',
    coalesce(v_requester_name, 'Ein Spieler') || ' wartet im Live Support.', '/admin'
  from public.live_support_agents agent
  join public.profiles profile on profile."supabaseId" = agent.user_id::text
  where agent.is_available = true and agent.last_seen_at >= now() - interval '90 seconds'
    and coalesce(profile.is_admin, false) = true;

  return jsonb_build_object('conversation_id', v_conversation.id, 'status', v_conversation.status);
end;
$$;

create or replace function public.live_support_admin_list_conversations()
returns table (
  conversation_id uuid,
  requester_id uuid,
  requester_username text,
  status text,
  agent_id uuid,
  agent_username text,
  created_at timestamptz,
  accepted_at timestamptz,
  last_message_at timestamptz,
  last_message text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles profile where profile."supabaseId" = v_uid::text and coalesce(profile.is_admin, false) = true) then raise exception 'ADMIN_REQUIRED'; end if;

  return query
  select
    conversation.id,
    conversation.requester_id,
    coalesce(requester.username, 'Spieler'),
    conversation.status,
    conversation.agent_id,
    agent.username,
    conversation.created_at,
    conversation.accepted_at,
    conversation.last_message_at,
    last_message.content
  from public.live_support_conversations conversation
  join public.profiles requester on requester."supabaseId" = conversation.requester_id::text
  left join public.profiles agent on agent."supabaseId" = conversation.agent_id::text
  left join lateral (
    select message.content from public.live_support_messages message
    where message.conversation_id = conversation.id
    order by message.created_at desc limit 1
  ) last_message on true
  where conversation.status = 'waiting' or (conversation.status = 'active' and conversation.agent_id = v_uid)
  order by case when conversation.status = 'waiting' then 0 else 1 end, conversation.last_message_at desc;
end;
$$;

create or replace function public.live_support_accept_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.live_support_conversations%rowtype;
  v_agent_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles profile where profile."supabaseId" = v_uid::text and coalesce(profile.is_admin, false) = true) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (
    select 1 from public.live_support_agents agent
    where agent.user_id = v_uid and agent.is_available = true
      and agent.last_seen_at >= now() - interval '90 seconds'
  ) then raise exception 'LIVE_SUPPORT_AGENT_OFFLINE'; end if;

  select * into v_conversation from public.live_support_conversations conversation
  where conversation.id = p_conversation_id and conversation.status = 'waiting' for update;
  if not found then raise exception 'LIVE_SUPPORT_REQUEST_NOT_AVAILABLE'; end if;

  update public.live_support_conversations
  set status = 'active', agent_id = v_uid, accepted_at = now(), last_message_at = now()
  where id = v_conversation.id;

  select coalesce(profile.username, 'Support') into v_agent_name
  from public.profiles profile where profile."supabaseId" = v_uid::text;
  insert into public.notifications (user_id, type, title, body, href)
  values (v_conversation.requester_id, 'live_support_assigned', 'Live Support ist da', coalesce(v_agent_name, 'Ein Support-Mitarbeiter') || ' hat deine Anfrage übernommen.', null);

  return jsonb_build_object('conversation_id', v_conversation.id, 'status', 'active');
end;
$$;

create or replace function public.live_support_list_messages(p_conversation_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  sender_role text,
  content text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.live_support_conversations%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_conversation from public.live_support_conversations conversation where conversation.id = p_conversation_id;
  if not found then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  if v_uid <> v_conversation.requester_id and v_uid <> v_conversation.agent_id then raise exception 'LIVE_SUPPORT_ACCESS_DENIED'; end if;

  return query
  select message.id, message.sender_id, coalesce(profile.username, 'Support'),
    case when message.sender_id = v_conversation.requester_id then 'user' else 'agent' end,
    message.content, message.created_at
  from public.live_support_messages message
  left join public.profiles profile on profile."supabaseId" = message.sender_id::text
  where message.conversation_id = v_conversation.id
  order by message.created_at asc limit 200;
end;
$$;

create or replace function public.live_support_send_message(p_conversation_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_conversation public.live_support_conversations%rowtype;
  v_message_id uuid;
  v_sender_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_content) < 1 or char_length(v_content) > 1500 then raise exception 'INVALID_MESSAGE_CONTENT'; end if;
  select * into v_conversation from public.live_support_conversations conversation where conversation.id = p_conversation_id for update;
  if not found then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.status = 'closed' then raise exception 'LIVE_SUPPORT_CONVERSATION_CLOSED'; end if;
  if v_uid <> v_conversation.requester_id and v_uid <> v_conversation.agent_id then raise exception 'LIVE_SUPPORT_ACCESS_DENIED'; end if;
  if v_uid = v_conversation.agent_id and v_conversation.status <> 'active' then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_ASSIGNED'; end if;
  if (select count(*) from public.live_support_messages message where message.sender_id = v_uid and message.created_at >= now() - interval '30 seconds') >= 12 then raise exception 'LIVE_SUPPORT_RATE_LIMIT'; end if;

  insert into public.live_support_messages (conversation_id, sender_id, content)
  values (v_conversation.id, v_uid, v_content) returning id into v_message_id;
  update public.live_support_conversations set last_message_at = now() where id = v_conversation.id;
  select coalesce(profile.username, 'Support') into v_sender_name from public.profiles profile where profile."supabaseId" = v_uid::text;

  if v_uid = v_conversation.requester_id and v_conversation.agent_id is not null then
    insert into public.notifications (user_id, type, title, body, href)
    values (v_conversation.agent_id, 'live_support_message', 'Neue Live-Support-Nachricht', left(v_content, 140), '/admin');
  elsif v_uid = v_conversation.agent_id then
    insert into public.notifications (user_id, type, title, body, href)
    values (v_conversation.requester_id, 'live_support_message', coalesce(v_sender_name, 'Support') || ' antwortet', left(v_content, 140), null);
  end if;
  return v_message_id;
end;
$$;

create or replace function public.live_support_close_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.live_support_conversations%rowtype;
  v_recipient uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_conversation from public.live_support_conversations conversation where conversation.id = p_conversation_id for update;
  if not found then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  if v_uid <> v_conversation.requester_id and v_uid <> v_conversation.agent_id then raise exception 'LIVE_SUPPORT_ACCESS_DENIED'; end if;
  if v_conversation.status = 'closed' then return; end if;
  update public.live_support_conversations set status = 'closed', closed_at = now(), last_message_at = now() where id = v_conversation.id;
  v_recipient := case when v_uid = v_conversation.requester_id then v_conversation.agent_id else v_conversation.requester_id end;
  if v_recipient is not null then
    insert into public.notifications (user_id, type, title, body, href)
    values (v_recipient, 'live_support_closed', 'Live Support beendet', 'Die Live-Support-Konversation wurde geschlossen.', null);
  end if;
end;
$$;

revoke all on function public.live_support_get_user_state() from public;
revoke all on function public.live_support_set_agent_availability(boolean) from public;
revoke all on function public.live_support_agent_heartbeat() from public;
revoke all on function public.live_support_get_agent_state() from public;
revoke all on function public.live_support_request() from public;
revoke all on function public.live_support_admin_list_conversations() from public;
revoke all on function public.live_support_accept_conversation(uuid) from public;
revoke all on function public.live_support_list_messages(uuid) from public;
revoke all on function public.live_support_send_message(uuid, text) from public;
revoke all on function public.live_support_close_conversation(uuid) from public;

grant execute on function public.live_support_get_user_state() to authenticated;
grant execute on function public.live_support_set_agent_availability(boolean) to authenticated;
grant execute on function public.live_support_agent_heartbeat() to authenticated;
grant execute on function public.live_support_get_agent_state() to authenticated;
grant execute on function public.live_support_request() to authenticated;
grant execute on function public.live_support_admin_list_conversations() to authenticated;
grant execute on function public.live_support_accept_conversation(uuid) to authenticated;
grant execute on function public.live_support_list_messages(uuid) to authenticated;
grant execute on function public.live_support_send_message(uuid, text) to authenticated;
grant execute on function public.live_support_close_conversation(uuid) to authenticated;

comment on table public.live_support_agents is 'Opt-in availability of RankedDarts administrators for live support.';
comment on table public.live_support_conversations is 'Private live support conversations; every open conversation has one requester and at most one assigned administrator.';
comment on table public.live_support_messages is 'Messages belonging to a live support conversation.';
