-- Unread friend-chat messages are tracked server-side so the global chat
-- launcher can show a reliable badge on every page.
--
-- Existing messages were created before read receipts existed. Mark them as
-- read on rollout so players do not receive a misleading backlog notification.

alter table public.friend_messages
  add column if not exists read_at timestamptz;

update public.friend_messages
set read_at = created_at
where read_at is null;

create index if not exists friend_messages_unread_recipient_idx
  on public.friend_messages (recipient_id, created_at desc)
  where read_at is null;

create or replace function public.get_my_friend_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select count(*)::integer
  into v_count
  from public.friend_messages message
  where message.recipient_id = v_uid
    and message.read_at is null;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.mark_friend_messages_read(p_friend_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_marked integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_friend_id is null or p_friend_id = v_uid then
    raise exception 'INVALID_FRIEND';
  end if;

  if not exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and v_uid in (friendship.requester_id, friendship.recipient_id)
      and p_friend_id in (friendship.requester_id, friendship.recipient_id)
  ) then
    raise exception 'FRIENDSHIP_REQUIRED';
  end if;

  update public.friend_messages message
  set read_at = now()
  where message.sender_id = p_friend_id
    and message.recipient_id = v_uid
    and message.read_at is null;

  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

revoke all on function public.get_my_friend_unread_count() from public;
revoke all on function public.mark_friend_messages_read(uuid) from public;

grant execute on function public.get_my_friend_unread_count() to authenticated;
grant execute on function public.mark_friend_messages_read(uuid) to authenticated;

comment on column public.friend_messages.read_at is 'When the recipient last opened the conversation after receiving this message.';
