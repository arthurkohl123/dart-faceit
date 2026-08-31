-- Private, rate-limited chat for accepted RankedDarts friendships.
-- The table itself remains inaccessible to browser roles; all reads and writes
-- are scoped through the functions below and require an accepted friendship.

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint friend_messages_distinct_users check (sender_id <> recipient_id)
);

create index if not exists friend_messages_conversation_created_idx
  on public.friend_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at desc
  );

alter table public.friend_messages enable row level security;
revoke all on public.friend_messages from anon, authenticated;

create or replace function public.send_friend_message(
  p_friend_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_message_id uuid;
  v_sender_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_friend_id is null or p_friend_id = v_uid then raise exception 'INVALID_FRIEND'; end if;
  if char_length(v_content) < 1 or char_length(v_content) > 1000 then raise exception 'INVALID_MESSAGE_CONTENT'; end if;

  if not exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and v_uid in (friendship.requester_id, friendship.recipient_id)
      and p_friend_id in (friendship.requester_id, friendship.recipient_id)
  ) then
    raise exception 'FRIENDSHIP_REQUIRED';
  end if;

  if (
    select count(*)
    from public.friend_messages message
    where message.sender_id = v_uid
      and message.created_at > now() - interval '30 seconds'
  ) >= 12 then
    raise exception 'FRIEND_CHAT_RATE_LIMIT';
  end if;

  insert into public.friend_messages (sender_id, recipient_id, content)
  values (v_uid, p_friend_id, v_content)
  returning id into v_message_id;

  select coalesce(profile.username, 'Ein Freund')
  into v_sender_name
  from public.profiles profile
  where profile."supabaseId" = v_uid::text;

  insert into public.notifications (user_id, type, title, body, href)
  values (
    p_friend_id,
    'friend_message',
    coalesce(v_sender_name, 'Ein Freund') || ' schreibt dir',
    left(v_content, 140),
    '/friends'
  );

  return v_message_id;
end;
$$;

create or replace function public.list_friend_messages(
  p_friend_id uuid,
  p_before timestamptz default null
)
returns table (
  id uuid,
  sender_id uuid,
  recipient_id uuid,
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
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_friend_id is null or p_friend_id = v_uid then raise exception 'INVALID_FRIEND'; end if;

  if not exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and v_uid in (friendship.requester_id, friendship.recipient_id)
      and p_friend_id in (friendship.requester_id, friendship.recipient_id)
  ) then
    raise exception 'FRIENDSHIP_REQUIRED';
  end if;

  return query
  select
    message.id,
    message.sender_id,
    message.recipient_id,
    message.content,
    message.created_at
  from public.friend_messages message
  where ((message.sender_id = v_uid and message.recipient_id = p_friend_id)
      or (message.sender_id = p_friend_id and message.recipient_id = v_uid))
    and message.created_at < coalesce(p_before, 'infinity'::timestamptz)
  order by message.created_at desc
  limit 80;
end;
$$;

revoke all on function public.send_friend_message(uuid, text) from public;
revoke all on function public.list_friend_messages(uuid, timestamptz) from public;
grant execute on function public.send_friend_message(uuid, text) to authenticated;
grant execute on function public.list_friend_messages(uuid, timestamptz) to authenticated;

comment on table public.friend_messages is 'Private chat between accepted friends. Browser access is available only through scoped RPC functions.';
